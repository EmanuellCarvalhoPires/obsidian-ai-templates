// Reads a template note: frontmatter (parsed with Obsidian's parseYaml) and Liquid body.
import { parseYaml } from "obsidian";
import { COLLISION_RULES, FIELD_TYPES } from "../types/template-types";
import type { CollisionRule, FieldSpec, FieldType, TemplateDefinition, TemplateProblem } from "../types/template-types";

export const TEMPLATE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function formatScalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value;
}

export function splitFrontmatter(content: string): { yaml: string | undefined; body: string } {
  const match = FRONTMATTER.exec(content);
  if (!match) return { yaml: undefined, body: content };
  return { yaml: match[1], body: content.slice(match[0].length) };
}

/** Normalizes line endings and drops the blank lines between the frontmatter and the body. */
export function cleanBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface FieldsParse {
  fields: FieldSpec[];
  errors: string[];
}

/** Reads the `fields` map: `name: { type, required, description, columns, default }` or `name: type`. */
export function parseFields(raw: unknown): FieldsParse {
  const fields: FieldSpec[] = [];
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { fields, errors };
  if (!isRecord(raw)) {
    return { fields, errors: ['"fields" must be a map of field name to { type, required, description, columns, default }.'] };
  }
  for (const [name, entry] of Object.entries(raw)) {
    if (!FIELD_NAME_PATTERN.test(name)) {
      errors.push(`Field name "${name}" is not valid: use letters, digits and "_", starting with a letter or "_".`);
      continue;
    }
    const spec: Record<string, unknown> = typeof entry === "string" ? { type: entry } : isRecord(entry) ? entry : {};
    if (typeof entry !== "string" && !isRecord(entry) && entry !== null && entry !== undefined) {
      errors.push(`Field "${name}" must be an object such as { type: string, required: true }.`);
      continue;
    }
    const type = (spec.type === undefined ? "string" : spec.type) as FieldType;
    if (!FIELD_TYPES.includes(type)) {
      errors.push(`Field "${name}" has the type "${formatScalar(spec.type)}". Valid types: ${FIELD_TYPES.join(", ")}.`);
      continue;
    }
    let columns: string[] | undefined;
    if (spec.columns !== undefined) {
      if (!Array.isArray(spec.columns) || spec.columns.some((c) => typeof c !== "string" || c === "")) {
        errors.push(`Field "${name}": "columns" must be a list of column names.`);
        continue;
      }
      if (type !== "table") {
        errors.push(`Field "${name}": "columns" only applies to fields of type table.`);
        continue;
      }
      columns = spec.columns as string[];
    }
    fields.push({
      name,
      type,
      required: spec.required === true,
      description: typeof spec.description === "string" ? spec.description : undefined,
      columns,
      default: spec.default,
    });
  }
  return { fields, errors };
}

export interface ParsedNote {
  /** False when the note has no `template_id`: it is just a note in the templates folder. */
  isTemplate: boolean;
  templateId?: string;
  definition?: TemplateDefinition;
  problems: TemplateProblem[];
}

/** Parses a note. A template with an error has no definition. */
export function parseTemplateNote(path: string, content: string): ParsedNote {
  const { yaml, body } = splitFrontmatter(content);
  if (yaml === undefined) return { isTemplate: false, problems: [] };

  let front: unknown;
  try {
    front = parseYaml(yaml);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Only report notes that were meant to be templates.
    if (!/template_id/.test(yaml)) return { isTemplate: false, problems: [] };
    return { isTemplate: true, problems: [{ level: "error", path, message: `The frontmatter is not valid YAML: ${reason}` }] };
  }
  if (!isRecord(front) || front.template_id === undefined || front.template_id === null) {
    return { isTemplate: false, problems: [] };
  }

  const problems: TemplateProblem[] = [];
  const rawId = typeof front.template_id === "string" || typeof front.template_id === "number" ? String(front.template_id).trim() : "";
  const error = (message: string): void => {
    problems.push({ level: "error", path, templateId: rawId || undefined, message });
  };
  if (!TEMPLATE_ID_PATTERN.test(rawId)) {
    error(`template_id "${formatScalar(front.template_id)}" is not valid: use letters, digits, "_" and "-" (up to 64 characters).`);
    return { isTemplate: true, problems };
  }

  const description = typeof front.description === "string" ? front.description.trim() : "";
  if (description === "") {
    problems.push({ level: "warning", path, templateId: rawId, message: "The template has no description. Agents choose templates by it." });
  }

  let targetPath: string | undefined;
  if (front.target_path !== undefined && front.target_path !== null) {
    if (typeof front.target_path !== "string" || front.target_path.trim() === "") error("target_path must be a non-empty text.");
    else targetPath = front.target_path.trim();
  }

  let collisionRule: CollisionRule | undefined;
  if (front.collision_rule !== undefined && front.collision_rule !== null) {
    if (typeof front.collision_rule === "string" && (COLLISION_RULES as readonly string[]).includes(front.collision_rule)) {
      collisionRule = front.collision_rule as CollisionRule;
    } else {
      error(`collision_rule "${formatScalar(front.collision_rule)}" is not valid. Use: ${COLLISION_RULES.join(", ")}.`);
    }
  }

  const parsedFields = parseFields(front.fields);
  for (const message of parsedFields.errors) error(message);

  if (problems.some((p) => p.level === "error")) return { isTemplate: true, templateId: rawId, problems };

  return {
    isTemplate: true,
    templateId: rawId,
    problems,
    definition: {
      id: rawId,
      description,
      targetPath,
      collisionRule,
      fields: parsedFields.fields,
      body: cleanBody(body),
      sourcePath: path,
    },
  };
}
