// Feeds the AI Ecosystem "hooks" service (rule data) and answers its guided setup.
// Every function tolerates an older AI Ecosystem without the service.
import { HOOKS_SERVICE } from "./types";
import type { AIEcosystemAPI, HooksService, SetupHandler } from "./types";
import { COLLISION_RULES } from "../types/template-types";
import type { AITemplatesSettings, CollisionRule, TemplateDefinition } from "../types/template-types";
import { normalizeTemplatesFolder } from "../settings/settings-store";

export const HOOKS_MODULE_ID = "ai-templates";

const EXPRESSION = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;

/**
 * Converts a template target path pattern to a vault-relative glob: every `{{ ... }}` or
 * `{% ... %}` expression becomes `*` (one segment piece) and the extension is kept.
 * Returns undefined when nothing usable is left.
 */
export function targetToGlob(target: string): string | undefined {
  let glob = target
    .trim()
    .replace(/[\\]/g, "/")
    .replace(EXPRESSION, "*")
    .replace(/\*{2,}/g, "*")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.?\//, "");
  if (glob === "" || glob === "*") return undefined;
  if (!/\.[A-Za-z0-9]+$/.test(glob)) glob += ".md";
  return glob;
}

/** Sorted, de-duplicated globs of the target paths of the given templates. */
export function computeTemplateTargets(templates: readonly TemplateDefinition[]): string[] {
  const globs = new Set<string>();
  for (const def of templates) {
    if (!def.targetPath) continue;
    const glob = targetToGlob(def.targetPath);
    if (glob) globs.add(glob);
  }
  return [...globs].sort();
}

/** Sends the rule data to the hooks service. Returns false when the service is missing. */
export function publishRuleData(api: AIEcosystemAPI | undefined, templates: readonly TemplateDefinition[]): boolean {
  try {
    const hooks = api?.getService<HooksService>(HOOKS_SERVICE);
    if (!hooks || typeof hooks.setRuleData !== "function") return false;
    hooks.setRuleData(HOOKS_MODULE_ID, { templateTargets: computeTemplateTargets(templates) });
    return true;
  } catch (err) {
    console.debug("[AI Templates] Could not publish hook rule data", err);
    return false;
  }
}

/** Registers the guided setup handler. Returns the unregister function (no-op when missing). */
export function registerSetupHandler(api: AIEcosystemAPI | undefined, handler: SetupHandler): () => void {
  try {
    const hooks = api?.getService<HooksService>(HOOKS_SERVICE);
    if (!hooks || typeof hooks.registerSetupHandler !== "function") return () => undefined;
    return hooks.registerSetupHandler(HOOKS_MODULE_ID, handler);
  } catch (err) {
    console.debug("[AI Templates] Could not register the setup handler", err);
    return () => undefined;
  }
}

export interface SetupHandlerDeps {
  getSettings: () => AITemplatesSettings;
  saveSettings: () => Promise<void>;
  getTemplateCount: () => number;
  folderExists: (path: string) => boolean;
}

/** Keys the guided setup may save, mapped to settings. */
export const SETUP_KEYS = [
  "pasta_de_templates",
  "regra_de_colisao",
  "pastas_de_imagens_permitidas",
  "limite_base64_mb",
  "links_markdown_classicos",
] as const;

function isCollisionRule(value: unknown): value is CollisionRule {
  return typeof value === "string" && (COLLISION_RULES as readonly string[]).includes(value);
}

export function createSetupHandler(deps: SetupHandlerDeps): SetupHandler {
  return {
    detect: () => {
      const settings = deps.getSettings();
      return Promise.resolve({
        templatesFolder: settings.templatesFolder,
        templateCount: deps.getTemplateCount(),
        // The plugin has no settings for these three; they are reported as facts only.
        defaultNotesFolder: null,
        dateFormat: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        namingConvention: settings.defaultCollisionRule,
        allowedImageFolders: settings.allowedImageFolders,
        base64LimitMb: settings.base64LimitMb,
        classicMarkdownLinks: settings.classicMarkdownLinks,
      });
    },
    save: async (key, value) => {
      const settings = deps.getSettings();
      switch (key) {
        case "pasta_de_templates": {
          if (typeof value !== "string" || value.trim() === "") return "pasta_de_templates must be a non-empty string";
          const parts = value.trim().replace(/[\\]/g, "/").split("/").filter((p) => p.trim() !== "" && p !== ".");
          if (parts.length === 0 || parts.some((p) => p === ".." || p.startsWith(".")) || /^[A-Za-z]:$/.test(parts[0] ?? "")) {
            return "pasta_de_templates must be a vault-relative folder without '..' or hidden segments";
          }
          settings.templatesFolder = normalizeTemplatesFolder(value);
          break;
        }
        case "regra_de_colisao":
          if (!isCollisionRule(value)) return `regra_de_colisao must be one of: ${COLLISION_RULES.join(", ")}`;
          settings.defaultCollisionRule = value;
          break;
        case "pastas_de_imagens_permitidas":
          if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
            return "pastas_de_imagens_permitidas must be a list of strings";
          }
          settings.allowedImageFolders = [...new Set((value as string[]).map((v) => v.trim()).filter((v) => v !== ""))];
          break;
        case "limite_base64_mb":
          if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
            return "limite_base64_mb must be a positive number";
          }
          settings.base64LimitMb = value;
          break;
        case "links_markdown_classicos":
          if (typeof value !== "boolean") return "links_markdown_classicos must be true or false";
          settings.classicMarkdownLinks = value;
          break;
        default:
          return `Unknown key "${key}". Accepted keys: ${SETUP_KEYS.join(", ")}`;
      }
      await deps.saveSettings();
      return undefined;
    },
    validate: () => {
      const folder = deps.getSettings().templatesFolder;
      return Promise.resolve(
        deps.folderExists(folder) ? { ok: true } : { ok: false, missing: [`templates folder "${folder}" does not exist`] },
      );
    },
  };
}
