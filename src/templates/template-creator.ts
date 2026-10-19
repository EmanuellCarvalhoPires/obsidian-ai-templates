// create_template: validates a template an agent wrote, then saves it as a note in the templates
// folder. The note is available right away. Saving replaces a note of the same id without an
// extra lock (decision of 19/10/2026).
import { normalizePath, stringifyYaml } from "obsidian";
import type { TemplateEngine } from "../engine/template-engine";
import { UserError } from "../errors";
import type { NoteCreator } from "../storage/note-creator";
import { checkVaultPath } from "../storage/path-guard";
import type { VaultPort } from "../storage/vault-port";
import { COLLISION_RULES } from "../types/template-types";
import type { CollisionRule, FieldSpec, TemplateDefinition } from "../types/template-types";
import { isPlainObject } from "./field-data";
import type { TemplateLoader } from "./template-loader";
import { TEMPLATE_ID_PATTERN, cleanBody, parseFields, parseTemplateNote } from "./template-parser";
import { checkDefinition } from "./template-validator";

export interface CreateTemplateArgs {
  templateId: unknown;
  description: unknown;
  targetPath: unknown;
  fields: unknown;
  markdownBody: unknown;
  collisionRule?: unknown;
}

export interface CreatedTemplate {
  templateId: string;
  /** Vault path of the template note. */
  path: string;
  /** False when an existing template of the same id was replaced. */
  created: boolean;
  variables: string[];
  warnings: string[];
}

export interface CreatorDeps {
  vault: VaultPort;
  engine: TemplateEngine;
  loader: TemplateLoader;
  notes: NoteCreator;
  getFolder: () => string;
}

function fieldToYaml(spec: FieldSpec): Record<string, unknown> {
  const out: Record<string, unknown> = { type: spec.type, required: spec.required };
  if (spec.description) out.description = spec.description;
  if (spec.columns && spec.columns.length > 0) out.columns = spec.columns;
  if (spec.default !== undefined) out.default = spec.default;
  return out;
}

/** The note text: frontmatter with the template settings, then the Liquid body. */
export function serializeTemplate(def: TemplateDefinition): string {
  const front: Record<string, unknown> = { template_id: def.id, description: def.description };
  if (def.targetPath) front.target_path = def.targetPath;
  if (def.collisionRule) front.collision_rule = def.collisionRule;
  front.fields = Object.fromEntries(def.fields.map((f) => [f.name, fieldToYaml(f)]));
  const body = def.body.endsWith("\n") ? def.body : `${def.body}\n`;
  return `---\n${stringifyYaml(front).trimEnd()}\n---\n\n${body}`;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new UserError(`"${label}" must be a non-empty text.`);
  return value;
}

export class TemplateCreator {
  constructor(private readonly deps: CreatorDeps) {}

  async create(args: CreateTemplateArgs): Promise<CreatedTemplate> {
    const { vault, engine, loader, notes } = this.deps;
    const id = requireText(args.templateId, "template_id").trim();
    if (!TEMPLATE_ID_PATTERN.test(id)) {
      throw new UserError(`template_id "${id}" is not valid: use letters, digits, "_" and "-" (up to 64 characters).`);
    }
    const description = requireText(args.description, "description").trim();
    const targetPath = requireText(args.targetPath, "target_path").trim();
    const body = cleanBody(requireText(args.markdownBody, "markdown_body"));

    let collisionRule: CollisionRule | undefined;
    if (args.collisionRule !== undefined && args.collisionRule !== null) {
      if (!(COLLISION_RULES as readonly unknown[]).includes(args.collisionRule)) {
        throw new UserError(`collision_rule must be one of: ${COLLISION_RULES.join(", ")}.`);
      }
      collisionRule = args.collisionRule as CollisionRule;
    }

    let rawFields = args.fields;
    if (typeof rawFields === "string") {
      try {
        rawFields = JSON.parse(rawFields) as unknown;
      } catch {
        throw new UserError('"fields" must be a JSON object, but the text is not valid JSON.');
      }
    }
    if (rawFields !== undefined && !isPlainObject(rawFields)) {
      throw new UserError('"fields" must be an object that maps each field name to { type, required, description, columns, default }.');
    }
    const parsed = parseFields(rawFields);

    const def: TemplateDefinition = {
      id,
      description,
      targetPath,
      collisionRule,
      fields: parsed.fields,
      body,
      sourcePath: "",
    };
    const check = checkDefinition(def, engine, { strictDeclared: true, configDir: vault.configDir });
    const errors = [...parsed.errors, ...check.errors];
    if (errors.length > 0) {
      throw new UserError(`The template was not saved. Fix and try again:\n- ${errors.join("\n- ")}`);
    }

    // Replace the note of the same id, or create <templates folder>/<id>.md.
    const existing = await loader.find(id);
    const folder = normalizePath(this.deps.getFolder().trim());
    const path = existing?.sourcePath ?? checkVaultPath(`${folder === "/" ? "" : `${folder}/`}${id}.md`, {
      configDir: vault.configDir,
      label: "The templates folder",
    });

    const content = serializeTemplate(def);
    // Read it back before writing: what is saved must load as the same template.
    const reread = parseTemplateNote(path, content);
    if (!reread.definition || reread.definition.id !== id || reread.definition.fields.length !== def.fields.length) {
      const reason = reread.problems.map((p) => p.message).join("; ");
      throw new UserError(`The template could not be written as a valid note${reason ? `: ${reason}` : "."}`);
    }

    const plan = notes.plan(path, "overwrite");
    await notes.write(plan, content, "overwrite");
    loader.invalidate();
    return { templateId: id, path, created: existing === undefined, variables: check.variables, warnings: check.warnings };
  }
}
