import { cellToString } from "../table-formatter";
import type { FilterRegistrar } from "./types";

const FORBIDDEN_FILE_CHARS = /[\\/:*?"<>|#^[\]]|\p{Cc}/gu;

/** Lowercase, accents removed, anything that is not a letter or digit becomes "-". */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Makes text safe as a file name on every OS and for Obsidian links. */
export function safeFilename(text: string): string {
  const cleaned = text
    .replace(FORBIDDEN_FILE_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return cleaned.slice(0, 120).trim();
}

/** Escapes characters that would change the meaning of Markdown text. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+!|<>~])/g, "\\$1");
}

/**
 * `slug`, `safe_filename`, `md_escape`, `bullet_list` and `wikilink`.
 * The first two are meant for `target_path`: `Logs/{{ titulo | slug }}.md`.
 */
export const registerStringFilters: FilterRegistrar = (engine) => {
  engine.registerFilter("slug", (value: unknown) => slugify(cellToString(value)));
  engine.registerFilter("safe_filename", (value: unknown) => safeFilename(cellToString(value)));
  engine.registerFilter("md_escape", (value: unknown) => escapeMarkdown(cellToString(value)));
  engine.registerFilter("wikilink", (value: unknown) => {
    const text = cellToString(value).replace(/[[\]|]/g, "").trim();
    return text === "" ? "" : `[[${text}]]`;
  });
  engine.registerFilter("bullet_list", (value: unknown) => {
    const items = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
    return items.map((item) => `- ${cellToString(item).replace(/\r\n|\r|\n/g, " ")}`).join("\n");
  });
};
