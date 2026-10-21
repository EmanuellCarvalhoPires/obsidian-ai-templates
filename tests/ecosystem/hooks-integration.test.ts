import { describe, expect, it, vi } from "vitest";
import {
  computeTemplateTargets,
  createSetupHandler,
  publishRuleData,
  registerSetupHandler,
  targetToGlob,
} from "../../src/ecosystem/hooks-integration";
import { HOOKS_SERVICE } from "../../src/ecosystem/types";
import type { AIEcosystemAPI, SetupHandler } from "../../src/ecosystem/types";
import { DEFAULT_SETTINGS } from "../../src/types/template-types";
import type { TemplateDefinition } from "../../src/types/template-types";

function def(id: string, targetPath?: string): TemplateDefinition {
  return { id, description: id, targetPath, fields: [], body: "", sourcePath: `Templates/AI/${id}.md` };
}

function apiWith(services: Record<string, unknown>): AIEcosystemAPI {
  return { getService: (name: string) => services[name] } as unknown as AIEcosystemAPI;
}

describe("hook rule data and setup handler", () => {
  describe("targetToGlob", () => {
    it("turns expressions into * and keeps the extension", () => {
      expect(targetToGlob("Knowledge/Logs/{{ titulo | slug }} - {{ today }}.md")).toBe("Knowledge/Logs/* - *.md");
      expect(targetToGlob("Notes/{% now 'YYYY' %}/{{ id }}.md")).toBe("Notes/*/*.md");
      expect(targetToGlob("{{ pasta }}/{{ nome }}")).toBe("*/*.md");
      expect(targetToGlob("Fixed/note.md")).toBe("Fixed/note.md");
      expect(targetToGlob("Dados\\{{ x }}.csv")).toBe("Dados/*.csv");
    });

    it("returns undefined when nothing fixed is left", () => {
      expect(targetToGlob("{{ x }}")).toBeUndefined();
      expect(targetToGlob("  ")).toBeUndefined();
    });
  });

  it("computes unique sorted targets and skips templates without target_path", () => {
    const targets = computeTemplateTargets([
      def("a", "Logs/{{ t }}.md"),
      def("b", "Logs/{{ other }}.md"),
      def("c"),
      def("d", "Aaa/{{ x }}.md"),
    ]);
    expect(targets).toEqual(["Aaa/*.md", "Logs/*.md"]);
  });

  it("publishes templateTargets through the hooks service", () => {
    const setRuleData = vi.fn();
    const api = apiWith({ [HOOKS_SERVICE]: { setRuleData } });
    expect(publishRuleData(api, [def("a", "Logs/{{ t }}.md")])).toBe(true);
    expect(setRuleData).toHaveBeenCalledWith("ai-templates", { templateTargets: ["Logs/*.md"] });
  });

  it("is harmless when the hooks service or api is missing", () => {
    expect(publishRuleData(undefined, [])).toBe(false);
    expect(publishRuleData(apiWith({}), [def("a", "x/{{ y }}.md")])).toBe(false);
    expect(() => registerSetupHandler(apiWith({}), {})()).not.toThrow();
  });

  it("registers the setup handler and returns the unregister function", () => {
    const off = vi.fn();
    const register = vi.fn().mockReturnValue(off);
    const handler: SetupHandler = {};
    registerSetupHandler(apiWith({ [HOOKS_SERVICE]: { registerSetupHandler: register } }), handler)();
    expect(register).toHaveBeenCalledWith("ai-templates", handler);
    expect(off).toHaveBeenCalled();
  });

  describe("setup handler", () => {
    function make(exists = true) {
      const settings = { ...DEFAULT_SETTINGS, allowedImageFolders: [...DEFAULT_SETTINGS.allowedImageFolders] };
      const saveSettings = vi.fn().mockResolvedValue(undefined);
      const handler = createSetupHandler({
        getSettings: () => settings,
        saveSettings,
        getTemplateCount: () => 4,
        folderExists: () => exists,
      });
      return { settings, saveSettings, handler };
    }

    it("detects folder, count and the settings that exist", async () => {
      const facts = await make().handler.detect?.();
      expect(facts).toMatchObject({
        templatesFolder: "Templates/AI",
        templateCount: 4,
        defaultNotesFolder: null,
        dateFormat: null,
        namingConvention: "incremental",
      });
      expect(typeof facts?.timezone === "string" || facts?.timezone === null).toBe(true);
    });

    it("saves known keys into settings", async () => {
      const { handler, settings, saveSettings } = make();
      expect(await handler.save?.("pasta_de_templates", "Meus\\Moldes/")).toBeUndefined();
      expect(settings.templatesFolder).toBe("Meus/Moldes");
      expect(await handler.save?.("regra_de_colisao", "overwrite")).toBeUndefined();
      expect(settings.defaultCollisionRule).toBe("overwrite");
      expect(await handler.save?.("pastas_de_imagens_permitidas", [" /x ", "/x", ""])).toBeUndefined();
      expect(settings.allowedImageFolders).toEqual(["/x"]);
      expect(await handler.save?.("limite_base64_mb", 5)).toBeUndefined();
      expect(settings.base64LimitMb).toBe(5);
      expect(await handler.save?.("links_markdown_classicos", true)).toBeUndefined();
      expect(settings.classicMarkdownLinks).toBe(true);
      expect(saveSettings).toHaveBeenCalledTimes(5);
    });

    it("refuses invalid values and unknown keys without saving", async () => {
      const { handler, saveSettings } = make();
      expect(await handler.save?.("pasta_de_templates", "../fora")).toEqual(expect.any(String));
      expect(await handler.save?.("regra_de_colisao", "nope")).toEqual(expect.any(String));
      expect(await handler.save?.("limite_base64_mb", "5")).toEqual(expect.any(String));
      expect(await handler.save?.("formato_de_data", "DD/MM/YYYY")).toMatch(/Unknown key/);
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("validates that the templates folder exists", async () => {
      expect(await make(true).handler.validate?.()).toEqual({ ok: true });
      const bad = await make(false).handler.validate?.();
      expect(bad?.ok).toBe(false);
      expect(bad?.missing).toHaveLength(1);
    });
  });
});
