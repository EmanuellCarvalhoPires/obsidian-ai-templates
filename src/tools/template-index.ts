// Indexed discovery of the templates (kind "template"): one tools.db entry per molde of the templates
// folder, and the runner that fills it when tools_run receives its id (template:<template_id>).
// Only the metadata goes in the index: the body of the template is never indexed.
import type { HubCallContext, HubToolResult, IndexedToolRunner, ToolIndexEntry } from "../ecosystem/types";
import { UserError } from "../errors";
import { buildSchema } from "../templates/schema";
import type { TemplateService } from "../templates/template-service";
import type { CollisionRule, FieldSpec, TemplateDefinition } from "../types/template-types";
import { asRecord, errorResult, jsonResultOf, noteResult, previewResult, safeRedactor } from "./templates-module";
import type { Redactor } from "./templates-module";

const TEMPLATE_TOOL_PREFIX = "template:";
const MAX_RESUMO_LENGTH = 100;
/** Arguments that are not field values: when `data` is missing, the other arguments are read as data. */
const CONTROL_KEYS = ["target_path", "data_file", "preview"];

/** Tool id of a molde in the index and in tools_run: template:<template_id>. */
export function templateToolName(templateId: string): string {
  return `${TEMPLATE_TOOL_PREFIX}${templateId}`;
}

/** The template_id of a tool id, or undefined when the id is not a template entry. */
export function templateIdFromToolName(toolName: string): string | undefined {
  if (!toolName.startsWith(TEMPLATE_TOOL_PREFIX)) return undefined;
  const id = toolName.slice(TEMPLATE_TOOL_PREFIX.length).trim();
  return id === "" ? undefined : id;
}

/** The vault folder a template writes into, when its target_path starts with a fixed folder. */
export function targetFolderOf(targetPath: string | undefined): string | undefined {
  if (!targetPath) return undefined;
  const fixed = targetPath.trim().replace(/\\/g, "/").split(/\{\{|\{%/)[0] ?? "";
  const slash = fixed.lastIndexOf("/");
  return slash > 0 ? fixed.slice(0, slash) : undefined;
}

function summarize(text: string): string {
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? "";
  if (firstLine.length <= MAX_RESUMO_LENGTH) return firstLine;
  return `${firstLine.slice(0, MAX_RESUMO_LENGTH - 3).trimEnd()}...`;
}

function jsonTypeOf(type: FieldSpec["type"]): string {
  switch (type) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "table":
    case "object":
      return "object";
    case "list":
      return "array";
    default:
      // string, date and image (a path or a file name) are text.
      return "string";
  }
}

/** JSON Schema of one field: the dynamic variable as the agent must fill it. */
function fieldSchema(spec: FieldSpec): Record<string, unknown> {
  const parts = [spec.description, spec.columns && spec.columns.length > 0 ? `Colunas: ${spec.columns.join(", ")}.` : undefined];
  return { type: jsonTypeOf(spec.type), description: parts.filter(Boolean).join(" ") || `Campo do tipo ${spec.type}.` };
}

/**
 * One tools.db entry per molde (kind "template"). The variables of the template are the fields of its
 * data schema; the required ones are listed in the description and in data.required.
 */
export function buildTemplateIndexEntries(templates: readonly TemplateDefinition[], defaultRule: CollisionRule): ToolIndexEntry[] {
  return templates.map((def) => {
    const required = def.fields.filter((f) => f.required).map((f) => f.name);
    const rule = def.collisionRule ?? defaultRule;
    const variables = required.length > 0 ? required.join(", ") : "nenhuma";
    const description = `${def.description || `Molde de nota "${def.id}".`} Variáveis obrigatórias: ${variables}.`;

    const properties: Record<string, unknown> = {};
    for (const field of def.fields) properties[field.name] = fieldSchema(field);
    const data: Record<string, unknown> = {
      type: "object",
      description: "Valores dos campos do molde, pelo nome do campo.",
      properties,
      additionalProperties: true,
    };
    if (required.length > 0) data.required = required;
    const inputSchema: Record<string, unknown> = {
      type: "object",
      properties: {
        data,
        target_path: { type: "string", description: "Caminho da nota no cofre. Substitui o target_path do molde." },
        preview: { type: "boolean", description: "true renders the note without saving it." },
      },
    };
    if (required.length > 0) inputSchema.required = ["data"];

    const entry: ToolIndexEntry = {
      name: templateToolName(def.id),
      title: def.id,
      description,
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: rule === "overwrite", idempotentHint: false, openWorldHint: false },
      kind: "template",
      categoria: targetFolderOf(def.targetPath) ?? "Moldes",
      tags: ["molde", "template", ...required],
      resumo: summarize(description),
      efeito: "cofre",
      exposicao: "indice",
      exemplo: buildSchema(def, defaultRule).example,
    };
    // A molde that overwrites an existing note always asks before it runs.
    if (rule === "overwrite") entry.aprovacao = "obrigatoria";
    return entry;
  });
}

/** Runs the moldes of this module for tools_run: creates the note, or renders it when preview is true. */
export class TemplateToolRunner implements IndexedToolRunner {
  private readonly redact: Redactor;

  constructor(
    private readonly service: TemplateService,
    redactOutput: Redactor,
  ) {
    this.redact = safeRedactor(redactOutput);
  }

  async run(id: string, args: Record<string, unknown>, ctx: HubCallContext): Promise<HubToolResult> {
    const templateId = templateIdFromToolName(id);
    if (templateId === undefined) {
      return errorResult(new UserError(`"${id}" is not a template of AI Templates.`), this.redact);
    }
    try {
      const input = asRecord(args);
      const data = input.data !== undefined ? input.data : Object.fromEntries(Object.entries(input).filter(([k]) => !CONTROL_KEYS.includes(k)));
      const request = {
        templateId,
        data,
        dataFile: input.data_file,
        targetPath: input.target_path,
        client: ctx.client.name,
      };
      if (input.preview === true) {
        const preview = await this.service.preview({ ...request, channel: "obsidian" });
        return jsonResultOf({ preview: true, ...previewResult(preview) }, this.redact);
      }
      return jsonResultOf(noteResult(await this.service.createNote(request)), this.redact);
    } catch (err) {
      return errorResult(err, this.redact);
    }
  }
}
