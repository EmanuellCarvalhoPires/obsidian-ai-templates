// The use cases of the plugin: list, schema, preview, create a note, create a template.
// The tools, the REST routes and the `templates` service of the Service Bus all call these.
import type { TemplateEngine } from "../engine/template-engine";
import { TemplateError } from "../engine/template-engine";
import { ImageValue } from "../engine/image-value";
import { UserError } from "../errors";
import type { AttachmentService, SavedAttachment } from "../storage/attachment-service";
import type { NoteCreator } from "../storage/note-creator";
import { checkVaultPath, toMarkdownPath } from "../storage/path-guard";
import type { VaultPort } from "../storage/vault-port";
import type {
  AITemplatesSettings,
  RenderChannel,
  TemplateDefinition,
  TemplateSchema,
  TemplateSummary,
  TemplatesService,
} from "../types/template-types";
import { isPlainObject, validateData } from "./field-data";
import { buildSchema } from "./schema";
import type { CreateTemplateArgs, CreatedTemplate, TemplateCreator } from "./template-creator";
import type { TemplateLoader } from "./template-loader";

/** Largest data_file the plugin reads, in bytes. */
export const MAX_DATA_FILE_BYTES = 5 * 1024 * 1024;

export interface ActivityEntry {
  type: string;
  target: string;
  status: number;
  durationMs: number;
  payload?: unknown;
}

export interface ServiceDeps {
  vault: VaultPort;
  engine: TemplateEngine;
  loader: TemplateLoader;
  attachments: AttachmentService;
  notes: NoteCreator;
  creator: TemplateCreator;
  getSettings: () => AITemplatesSettings;
  /** Reports what the AI Ecosystem does not log by itself (notes and files written). */
  logActivity?: (entry: ActivityEntry) => void;
  now?: () => number;
}

export interface NoteArgs {
  templateId: unknown;
  data?: unknown;
  dataFile?: unknown;
  targetPath?: unknown;
}

export interface PreviewResult {
  markdown: string;
  /** Where the note would be written, when it can be known. */
  targetPath?: string;
  warnings: string[];
}

export interface CreatedNote {
  /** Vault path of the note that was written. */
  filePath: string;
  /** The path before the collision rule. */
  requestedPath: string;
  renamed: boolean;
  overwritten: boolean;
  attachments: SavedAttachment[];
  warnings: string[];
}

function asDataObject(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new UserError(`"${label}" must be a JSON object, but the text is not valid JSON.`);
    }
  }
  if (!isPlainObject(parsed)) throw new UserError(`"${label}" must be a JSON object.`);
  return parsed;
}

export class TemplateService implements TemplatesService {
  constructor(private readonly deps: ServiceDeps) {}

  // ---- Service Bus ----------------------------------------------------------

  listTemplates(): Promise<TemplateSummary[]> {
    return this.deps.loader.list();
  }

  async getSchema(templateId: string): Promise<TemplateSchema> {
    const def = await this.deps.loader.require(templateId);
    return buildSchema(def, this.deps.getSettings().defaultCollisionRule);
  }

  /** Renders without saving anything (images are checked, not written). */
  async render(templateId: string, data: unknown, channel: RenderChannel = "obsidian"): Promise<string> {
    const result = await this.preview({ templateId, data, channel });
    return result.markdown;
  }

  // ---- preview --------------------------------------------------------------

  async preview(args: NoteArgs & { channel?: unknown }): Promise<PreviewResult> {
    const channel = this.readChannel(args.channel);
    const def = await this.deps.loader.require(args.templateId);
    const input = await this.readInput(args);
    const check = this.check(def, input);
    const scope = await this.withImages(def, check.data, { save: false, sourcePath: "" });
    const markdown = this.renderBody(def, scope.data, channel);

    let targetPath: string | undefined;
    const rawTarget = this.targetOf(def, args.targetPath);
    if (rawTarget !== undefined) {
      try {
        targetPath = this.resolveTargetPath(rawTarget, check.data);
      } catch (err) {
        if (err instanceof UserError) check.warnings.push(`target_path: ${err.message}`);
        else throw err;
      }
    }
    return { markdown, targetPath, warnings: check.warnings };
  }

  // ---- create a note --------------------------------------------------------

  async createNote(args: NoteArgs): Promise<CreatedNote> {
    const { deps } = this;
    const startedAt = (deps.now ?? Date.now)();
    const def = await deps.loader.require(args.templateId);
    const input = await this.readInput(args);
    const check = this.check(def, input);

    const rawTarget = this.targetOf(def, args.targetPath);
    if (rawTarget === undefined) {
      throw new UserError(
        `The template "${def.id}" has no target_path. Send "target_path" (a path relative to the vault, for example "Notes/My note.md").`,
      );
    }
    const requested = this.resolveTargetPath(rawTarget, check.data);
    const rule = def.collisionRule ?? deps.getSettings().defaultCollisionRule;
    const plan = deps.notes.plan(requested, rule);

    // Dry run first: a broken template or image must fail before any file is written.
    const dry = await this.withImages(def, check.data, { save: false, sourcePath: plan.path });
    this.renderBody(def, dry.data, "obsidian");

    const real = await this.withImages(def, check.data, { save: true, sourcePath: plan.path });
    let markdown = this.renderBody(def, real.data, "obsidian");
    if (!markdown.endsWith("\n")) markdown += "\n";
    const written = await deps.notes.write(plan, markdown, rule);

    this.report("note-created", written.path, startedAt, {
      template: def.id,
      overwritten: written.overwrite,
      renamed: written.path !== requested,
      attachments: real.saved.length,
    });
    for (const saved of real.saved) {
      this.report("attachment-saved", saved.vaultPath, startedAt, { field: saved.field, source: saved.source, bytes: saved.bytes });
    }
    return {
      filePath: written.path,
      requestedPath: requested,
      renamed: written.path !== requested,
      overwritten: written.overwrite,
      attachments: real.saved,
      warnings: check.warnings,
    };
  }

  // ---- create a template ----------------------------------------------------

  async createTemplate(args: CreateTemplateArgs): Promise<CreatedTemplate> {
    const startedAt = (this.deps.now ?? Date.now)();
    const created = await this.deps.creator.create(args);
    this.report(created.created ? "template-created" : "template-updated", created.path, startedAt, { template: created.templateId });
    return created;
  }

  // ---- internals ------------------------------------------------------------

  private readChannel(value: unknown): RenderChannel {
    if (value === undefined || value === null || value === "obsidian") return "obsidian";
    if (value === "telegram") return "telegram";
    throw new UserError('"channel" must be "obsidian" or "telegram".');
  }

  private report(type: string, target: string, startedAt: number, payload: unknown): void {
    const now = (this.deps.now ?? Date.now)();
    try {
      this.deps.logActivity?.({ type, target, status: 200, durationMs: Math.max(0, now - startedAt), payload });
    } catch (err) {
      console.debug("[AI Templates] Could not log activity", err);
    }
  }

  /** Reads `data` and `data_file` (data wins over the file, key by key). */
  private async readInput(args: NoteArgs): Promise<unknown> {
    const direct = asDataObject(args.data, "data");
    let fromFile: Record<string, unknown> | undefined;
    if (args.dataFile !== undefined && args.dataFile !== null && args.dataFile !== "") {
      const { vault } = this.deps;
      const path = checkVaultPath(args.dataFile, { configDir: vault.configDir, label: "data_file" });
      if (vault.kind(path) !== "file") throw new UserError(`data_file "${path}" was not found in the vault.`, "not_found");
      const text = await vault.readText(path);
      if (text.length > MAX_DATA_FILE_BYTES) throw new UserError(`data_file "${path}" is larger than ${MAX_DATA_FILE_BYTES} bytes.`, "too_large");
      fromFile = asDataObject(text, `data_file "${path}"`);
    }
    if (direct === undefined && fromFile === undefined) return {};
    return { ...(fromFile ?? {}), ...(direct ?? {}) };
  }

  private check(def: TemplateDefinition, input: unknown): { data: Record<string, unknown>; warnings: string[] } {
    const result = validateData(def.fields, input, {
      checkImage: (value) => this.deps.attachments.describeInputProblem(value),
      now: () => new Date((this.deps.now ?? Date.now)()),
    });
    if (result.errors.length > 0) {
      throw new UserError(
        `The data does not match the template "${def.id}". Fix and try again:\n- ${result.errors.join("\n- ")}\n` +
          `Call get_template_schema for the fields and an example.`,
      );
    }
    return { data: result.data, warnings: result.warnings };
  }

  /** Replaces image inputs with ImageValue (saving the files when asked). */
  private async withImages(
    def: TemplateDefinition,
    data: Record<string, unknown>,
    options: { save: boolean; sourcePath: string },
  ): Promise<{ data: Record<string, unknown>; saved: SavedAttachment[] }> {
    const out: Record<string, unknown> = { ...data };
    const saved: SavedAttachment[] = [];
    for (const spec of def.fields) {
      if (spec.type !== "image" || out[spec.name] === undefined) continue;
      try {
        const resolved = await this.deps.attachments.resolve(out[spec.name], {
          field: spec.name,
          sourcePath: options.sourcePath,
          save: options.save,
        });
        out[spec.name] = resolved.value;
        if (resolved.saved) saved.push(resolved.saved);
      } catch (err) {
        if (err instanceof UserError) throw new UserError(`Field "${spec.name}" (image): ${err.message}`, err.code);
        throw err;
      }
    }
    return { data: out, saved };
  }

  private renderBody(def: TemplateDefinition, data: Record<string, unknown>, channel: RenderChannel): string {
    try {
      return this.deps.engine.render(def.body, data, channel);
    } catch (err) {
      if (err instanceof TemplateError) throw new UserError(`The template "${def.id}" could not be rendered: ${err.message}`);
      throw err;
    }
  }

  private targetOf(def: TemplateDefinition, override: unknown): string | undefined {
    if (override !== undefined && override !== null && override !== "") {
      if (typeof override !== "string") throw new UserError('"target_path" must be a text.');
      return override;
    }
    return def.targetPath;
  }

  /** Renders the target_path expression and checks the result. */
  private resolveTargetPath(raw: string, data: Record<string, unknown>): string {
    // Image fields are not resolved yet, and a path must not depend on them.
    const scope: Record<string, unknown> = { ...data };
    for (const [key, value] of Object.entries(scope)) if (value instanceof ImageValue) delete scope[key];
    let rendered: string;
    try {
      rendered = this.deps.engine.render(raw, scope, "obsidian").trim();
    } catch (err) {
      if (err instanceof TemplateError) throw new UserError(`target_path could not be rendered: ${err.message}`);
      throw err;
    }
    const checked = checkVaultPath(rendered, { configDir: this.deps.vault.configDir, label: "target_path" });
    return toMarkdownPath(checked);
  }
}
