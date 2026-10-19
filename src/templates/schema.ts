// get_template_schema: the fields, the rules and a ready-to-fill JSON example.
import type { CollisionRule, FieldSpec, TemplateDefinition, TemplateSchema } from "../types/template-types";

function exampleValue(spec: FieldSpec): unknown {
  if (spec.default !== undefined) return spec.default;
  switch (spec.type) {
    case "string":
      return spec.description ? `<${spec.description}>` : `<${spec.name}>`;
    case "number":
      return 0;
    case "boolean":
      return true;
    case "date":
      return "2026-01-31";
    case "table": {
      const headers = spec.columns && spec.columns.length > 0 ? spec.columns : ["Column 1", "Column 2"];
      return { headers, rows: [headers.map(() => "...")] };
    }
    case "image":
      return "<absolute path of a local image file, or the name of a file already in the vault>";
    case "list":
      return ["item 1", "item 2"];
    case "object":
      return {};
  }
}

const NOTES: Record<string, string> = {
  table:
    'table: send { "headers": [...], "rows": [[...], ...] }, or a list of objects (one object per row). Cells with | or line breaks are escaped for you.',
  image:
    "image: prefer the absolute path of a local file (cheap in tokens, read only from allowed folders). A file name that already is in the vault also works. Base64 works but costs many tokens and has a size limit.",
  date: "date: ISO 8601 text such as 2026-01-31 or 2026-01-31T14:30.",
  list: "list: a JSON array.",
  number: "number: a JSON number (numeric text such as \"3\" is accepted).",
  boolean: "boolean: true or false.",
};

/** Builds the schema an agent reads before filling a template. */
export function buildSchema(def: TemplateDefinition, defaultRule: CollisionRule): TemplateSchema {
  const example: Record<string, unknown> = {};
  for (const spec of def.fields) example[spec.name] = exampleValue(spec);

  const notes: string[] = ['Send the values as the "data" object, keyed by field name. Fields with required: false can be left out.'];
  const types = new Set(def.fields.map((f) => f.type));
  for (const [type, text] of Object.entries(NOTES)) if (types.has(type as FieldSpec["type"])) notes.push(text);
  if (def.targetPath) notes.push("target_path comes from the template; send target_path to override it. Both can use {{ field }} values.");
  else notes.push("This template has no target_path: send one when creating the note.");

  return {
    id: def.id,
    description: def.description,
    targetPath: def.targetPath,
    collisionRule: def.collisionRule ?? defaultRule,
    fields: def.fields,
    example,
    notes,
  };
}
