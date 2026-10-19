import { ImageValue } from "../image-value";
import { FilterError, type FilterRegistrar } from "./types";

function linkTextOf(value: unknown): string | undefined {
  if (value instanceof ImageValue) return value.linkText;
  if (typeof value === "string" && value.trim() !== "") {
    // Accept "![[a.png]]" and "[[a.png]]" written by hand.
    const wiki = /^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(value.trim());
    return wiki?.[1]?.trim() ?? value.trim();
  }
  if (typeof value === "object" && value !== null) {
    const text = (value as { linkText?: unknown }).linkText;
    if (typeof text === "string" && text !== "") return text;
  }
  return undefined;
}

function readWidth(args: unknown[]): number | undefined {
  // `obsidian_image: 500` and `obsidian_image: width: 500` (keyword form arrives as ["width", 500]).
  let raw: unknown = args[0];
  if (Array.isArray(raw) && raw[0] === "width") raw = raw[1];
  if (raw === undefined || raw === null || raw === "") return undefined;
  const width = Number(raw);
  if (!Number.isFinite(width) || width <= 0 || width > 10000) {
    throw new FilterError("obsidian_image", `the width must be a positive number of pixels, got "${String(raw)}"`);
  }
  return Math.round(width);
}

function encodeClassicPath(path: string): string {
  return encodeURI(path).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/**
 * `{{ diagrama | obsidian_image: 500 }}` gives `![[arquivo.png|500]]` (or `![[arquivo.png]]`),
 * or a classic Markdown link when the setting asks for it.
 */
export const registerImageFilters: FilterRegistrar = (engine, env) => {
  engine.registerFilter("obsidian_image", function (value: unknown, ...args: unknown[]) {
    const linkText = linkTextOf(value);
    if (linkText === undefined) return "";
    const width = readWidth(args);
    if (env.channel === "telegram") return linkText;
    if (env.classicMarkdownLinks()) {
      const target = value instanceof ImageValue ? value.vaultPath : linkText;
      return `![${width ? `|${width}` : ""}](${encodeClassicPath(target)})`;
    }
    return `![[${linkText}${width ? `|${width}` : ""}]]`;
  });
};
