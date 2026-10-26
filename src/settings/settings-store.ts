// Loads and normalizes data.json. Never throws: garbage in, defaults out.
import {
  COLLISION_RULES,
  DEFAULT_SETTINGS,
  MAX_BASE64_LIMIT_MB,
  MIN_BASE64_LIMIT_MB,
} from "../types/template-types";
import type { AITemplatesSettings, CollisionRule } from "../types/template-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalizes a vault-relative templates folder: forward slashes, no leading or trailing slash,
 * and rejects traversal (".."), absolute paths or hidden config folders.
 */
export function normalizeTemplatesFolder(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS.templatesFolder;
  const parts = value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p !== "" && p !== ".");
  if (parts.length === 0) return DEFAULT_SETTINGS.templatesFolder;
  if (parts.some((p) => p === ".." || p.startsWith("."))) return DEFAULT_SETTINGS.templatesFolder;
  if (/^[A-Za-z]:$/.test(parts[0] ?? "")) return DEFAULT_SETTINGS.templatesFolder;
  return parts.join("/");
}

function isCollisionRule(value: unknown): value is CollisionRule {
  return typeof value === "string" && (COLLISION_RULES as readonly string[]).includes(value);
}

function normalizeAllowedFolders(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.allowedImageFolders];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed === "" || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim() !== "" && !out.includes(item.trim())) out.push(item.trim());
  }
  return out;
}

function clampBase64Limit(value: unknown): number {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return DEFAULT_SETTINGS.base64LimitMb;
  const clamped = Math.min(MAX_BASE64_LIMIT_MB, Math.max(MIN_BASE64_LIMIT_MB, num));
  return Math.round(clamped * 100) / 100;
}

export function normalizeSettings(raw: unknown): AITemplatesSettings {
  const data = isRecord(raw) ? raw : {};
  return {
    templatesFolder: normalizeTemplatesFolder(data.templatesFolder),
    defaultCollisionRule: isCollisionRule(data.defaultCollisionRule)
      ? data.defaultCollisionRule
      : DEFAULT_SETTINGS.defaultCollisionRule,
    allowedImageFolders: normalizeAllowedFolders(data.allowedImageFolders),
    base64LimitMb: clampBase64Limit(data.base64LimitMb),
    classicMarkdownLinks:
      typeof data.classicMarkdownLinks === "boolean"
        ? data.classicMarkdownLinks
        : DEFAULT_SETTINGS.classicMarkdownLinks,
    installStarterPack:
      typeof data.installStarterPack === "boolean" ? data.installStarterPack : DEFAULT_SETTINGS.installStarterPack,
    starterPackInstalledIds: normalizeIdList(data.starterPackInstalledIds),
  };
}
