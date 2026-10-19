// Shared types of the AI Templates plugin. Plain types and constants: no Obsidian runtime code.

export type CollisionRule = "incremental" | "overwrite" | "error";

export const COLLISION_RULES: readonly CollisionRule[] = ["incremental", "overwrite", "error"];

export type FieldType = "string" | "number" | "boolean" | "date" | "table" | "image" | "list" | "object";

export const FIELD_TYPES: readonly FieldType[] = [
  "string",
  "number",
  "boolean",
  "date",
  "table",
  "image",
  "list",
  "object",
];

export type RenderChannel = "obsidian" | "telegram";

/** One entry of the `fields` map in a template's frontmatter. */
export interface FieldSpec {
  name: string;
  type: FieldType;
  required: boolean;
  description?: string;
  /** Declared column order of a `table` field. */
  columns?: string[];
  default?: unknown;
}

/** A template note, parsed. */
export interface TemplateDefinition {
  id: string;
  description: string;
  /** Raw `target_path`: may contain template expressions, rendered later by the engine. */
  targetPath?: string;
  collisionRule?: CollisionRule;
  fields: FieldSpec[];
  /** Note content after the frontmatter. */
  body: string;
  /** Vault path of the template note. */
  sourcePath: string;
}

export interface TemplateSummary {
  id: string;
  description: string;
}

/** What `get_template_schema` returns: fields, rules and a ready-to-fill example. */
export interface TemplateSchema {
  id: string;
  description: string;
  targetPath?: string;
  /** The template's own rule, or the default rule from the settings. */
  collisionRule: CollisionRule;
  fields: FieldSpec[];
  /** Generated JSON example of the `data` argument. */
  example: Record<string, unknown>;
  /** Rules the agent must know to fill the fields (accepted table shapes, image forms...). */
  notes: string[];
}

/** A problem found while loading a template note. Errors keep the template out of the list. */
export interface TemplateProblem {
  level: "error" | "warning";
  /** Vault path of the template note. */
  path: string;
  /** Template id, when it could be read. */
  templateId?: string;
  message: string;
}

/** Matrix form of a table: what the formatter works with. */
export interface TableMatrix {
  headers: string[];
  rows: unknown[][];
}

/** An image field after the attachment service saved (or found) the file. */
export interface ResolvedImage {
  /** Vault path of the attachment. */
  vaultPath: string;
  /** Link text for `![[...]]`, shortest unambiguous form. */
  linkText: string;
}

/**
 * The `templates` service registered in the AI Ecosystem Service Bus (consumed by, for example,
 * the Telegram AI Gateway).
 */
export interface TemplatesService {
  render(templateId: string, data: unknown, channel?: RenderChannel): Promise<string>;
  getSchema(templateId: string): Promise<TemplateSchema>;
  listTemplates(): Promise<TemplateSummary[]>;
}

/** Settings stored in data.json. */
export interface AITemplatesSettings {
  /** Vault folder that holds the template notes. */
  templatesFolder: string;
  defaultCollisionRule: CollisionRule;
  /**
   * Absolute disk folders local images may be read from. "{tmpdir}" stands for the system
   * temporary folder, so the default works on every machine.
   */
  allowedImageFolders: string[];
  /** Largest accepted base64 image, in megabytes. */
  base64LimitMb: number;
  /** Insert classic Markdown image links instead of wikilink embeds. */
  classicMarkdownLinks: boolean;
}

export const TMPDIR_TOKEN = "{tmpdir}";

export const DEFAULT_SETTINGS: AITemplatesSettings = {
  templatesFolder: "Templates/AI",
  defaultCollisionRule: "incremental",
  allowedImageFolders: [TMPDIR_TOKEN, `${TMPDIR_TOKEN}/claude`],
  base64LimitMb: 2,
  classicMarkdownLinks: false,
};

export const MIN_BASE64_LIMIT_MB = 0.1;
export const MAX_BASE64_LIMIT_MB = 50;
