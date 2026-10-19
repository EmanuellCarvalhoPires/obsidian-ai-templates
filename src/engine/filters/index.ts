import type { Liquid } from "liquidjs";
import { registerDateFilters } from "./date";
import { registerImageFilters } from "./image";
import { registerStringFilters } from "./string";
import { registerTableFilters } from "./table";
import type { FilterEnv } from "./types";

export { slugify, safeFilename, escapeMarkdown } from "./string";
export type { FilterEnv } from "./types";

/** Registers every plugin filter and tag in the engine. */
export function registerFilters(engine: Liquid, env: FilterEnv): void {
  registerTableFilters(engine, env);
  registerImageFilters(engine, env);
  registerDateFilters(engine, env);
  registerStringFilters(engine, env);
}

/** Names of the filters and tags added by the plugin (for the README and the editor help). */
export const PLUGIN_FILTERS = [
  "markdown_table",
  "obsidian_image",
  "date_fmt",
  "slug",
  "safe_filename",
  "md_escape",
  "wikilink",
  "bullet_list",
] as const;
export const PLUGIN_TAGS = ["now"] as const;
