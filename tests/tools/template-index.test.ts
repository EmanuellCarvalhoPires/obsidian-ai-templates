import * as nodePath from "node:path";
import { describe, expect, it } from "vitest";
import type { HubCallContext } from "../../src/ecosystem/types";
import { TemplateEngine } from "../../src/engine/template-engine";
import { AttachmentService } from "../../src/storage/attachment-service";
import { NoteCreator } from "../../src/storage/note-creator";
import type { FsPort } from "../../src/storage/path-guard";
import { TemplateCreator } from "../../src/templates/template-creator";
import { TemplateLoader } from "../../src/templates/template-loader";
import { parseTemplateNote } from "../../src/templates/template-parser";
import { TemplateService } from "../../src/templates/template-service";
import { buildTemplateIndexEntries, targetFolderOf, templateIdFromToolName, TemplateToolRunner } from "../../src/tools/template-index";
import { buildTools } from "../../src/tools/templates-module";
import { DEFAULT_SETTINGS, type AITemplatesSettings } from "../../src/types/template-types";
import { MemoryVault } from "../storage/attachment-and-notes.test";

const CALL_CTX: HubCallContext = {
  client: { id: "claude-code", name: "Claude Code" },
  moduleId: "ai-templates",
};

const SPRINT_NOTE = [
  "---",
  "template_id: sprint_report",
  "description: Relatório semanal da sprint",
  "target_path: Reports/Sprint-{{ sprint }} - {{ title | slug }}.md",
  "fields:",
  "  title:",
  "    type: string",
  "    required: true",
  "  sprint:",
  "    type: number",
  "    required: true",
  "  notes:",
  "    type: string",
  "    required: false",
  "---",
  "# Sprint {{ sprint }} - {{ title }}",
  "{{ notes }}",
].join("\n");

const OVERWRITE_NOTE = [
  "---",
  "template_id: resumo_diario",
  "description: Resumo do dia",
  "target_path: Diario/Hoje.md",
  "collision_rule: overwrite",
  "fields:",
  "  texto:",
  "    type: string",
  "    required: true",
  "---",
  "{{ texto }}",
].join("\n");

function setupStack() {
  const fixedDate = new Date(2026, 9, 23, 9, 0, 0);
  const vault = new MemoryVault();
  const settings: AITemplatesSettings = { ...DEFAULT_SETTINGS };
  const engine = new TemplateEngine({ now: () => fixedDate, classicMarkdownLinks: () => settings.classicMarkdownLinks });
  const notes = new NoteCreator(vault);
  const tmpDir = nodePath.resolve("/tmp/ai-index");
  const fs: FsPort = {
    tmpdir: () => tmpDir,
    realpath: async (p) => nodePath.resolve(p),
    stat: async () => ({ isFile: true, size: 12 }),
    readFile: async () => new Uint8Array([1, 2, 3]),
  };
  const attachments = new AttachmentService({
    vault,
    fs,
    getAllowedFolders: () => settings.allowedImageFolders,
    getBase64LimitMb: () => settings.base64LimitMb,
    ensureFolder: (dir) => notes.ensureFolder(dir),
  });
  const loader = new TemplateLoader({ vault, engine, getFolder: () => settings.templatesFolder });
  const creator = new TemplateCreator({ vault, engine, loader, notes, getFolder: () => settings.templatesFolder });
  const service = new TemplateService({
    vault,
    engine,
    loader,
    attachments,
    notes,
    creator,
    getSettings: () => settings,
    now: () => fixedDate.getTime(),
  });
  return { vault, settings, loader, service };
}

describe("template index (tools.db kind template)", () => {
  it("indexes each molde with its id, required variables and effect", async () => {
    const { vault, settings, loader } = setupStack();
    await vault.createText("Templates/AI/sprint_report.md", SPRINT_NOTE);
    await vault.createText("Templates/AI/resumo_diario.md", OVERWRITE_NOTE);
    const { templates } = await loader.load();

    const entries = buildTemplateIndexEntries(templates, settings.defaultCollisionRule);
    const sprint = entries.find((e) => e.name === "template:sprint_report");
    expect(sprint).toBeDefined();
    expect(sprint?.kind).toBe("template");
    expect(sprint?.efeito).toBe("cofre");
    expect(sprint?.exposicao).toBe("indice");
    expect(sprint?.categoria).toBe("Reports");
    expect(sprint?.description).toContain("Variáveis obrigatórias: title, sprint.");
    expect(sprint?.inputSchema).toMatchObject({
      properties: { data: { required: ["title", "sprint"] } },
      required: ["data"],
    });
    const data = (sprint?.inputSchema as { properties: { data: { properties: Record<string, { type: string }> } } }).properties.data;
    expect(data.properties.sprint?.type).toBe("number");
    expect(sprint?.aprovacao).toBeUndefined();

    const daily = entries.find((e) => e.name === "template:resumo_diario");
    expect(daily?.annotations?.destructiveHint).toBe(true);
    expect(daily?.aprovacao).toBe("obrigatoria");
  });

  it("extracts the fixed folder of a target path", () => {
    expect(targetFolderOf("Reports/Sprint-{{ sprint }}.md")).toBe("Reports");
    expect(targetFolderOf("Logs/{% now 'YYYY-MM-DD' %}-{{ titulo | slug }}.md")).toBe("Logs");
    expect(targetFolderOf("{{ titulo }}.md")).toBeUndefined();
    expect(targetFolderOf(undefined)).toBeUndefined();
  });

  it("runs a molde by tool id: creates the note, or renders it in preview", async () => {
    const { vault, loader, service } = setupStack();
    await vault.createText("Templates/AI/sprint_report.md", SPRINT_NOTE);
    const runner = new TemplateToolRunner(service, (text) => text);

    expect(templateIdFromToolName("template:sprint_report")).toBe("sprint_report");
    expect(templateIdFromToolName("script_buscar_notas")).toBeUndefined();

    const preview = await runner.run("template:sprint_report", { data: { title: "Oi", sprint: 4 }, preview: true }, CALL_CTX);
    expect(preview.isError).toBeFalsy();
    expect(preview.structuredContent).toMatchObject({ preview: true });
    expect(vault.files.has("Reports/Sprint-4 - oi.md")).toBe(false);

    const created = await runner.run("template:sprint_report", { data: { title: "Oi", sprint: 4 } }, CALL_CTX);
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent).toMatchObject({ success: true, file_path: "Reports/Sprint-4 - oi.md" });
    expect(vault.files.get("Reports/Sprint-4 - oi.md")).toContain("# Sprint 4 - Oi");
    expect(loader.lastResult()).toBeDefined();
  });

  it("accepts flat arguments when data is missing, and reports missing required fields", async () => {
    const { vault, service } = setupStack();
    await vault.createText("Templates/AI/sprint_report.md", SPRINT_NOTE);
    const runner = new TemplateToolRunner(service, (text) => text);

    const flat = await runner.run("template:sprint_report", { title: "Plano", sprint: 5, target_path: "Reports/x.md" }, CALL_CTX);
    expect(flat.isError).toBeFalsy();
    expect(vault.files.get("Reports/x.md")).toContain("# Sprint 5 - Plano");

    const missing = await runner.run("template:sprint_report", { data: { title: "Sem sprint" } }, CALL_CTX);
    expect(missing.isError).toBe(true);
  });

  it("keeps the native tools with their effect and exposure", () => {
    const { service, loader } = setupStack();
    const tools = buildTools(service, loader);
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.create_note_from_template?.efeito).toBe("cofre");
    expect(byName.create_note_from_template?.exposicao).toBe("indice");
    expect(byName.preview_template?.efeito).toBe("cofre");
    expect(byName.preview_template?.exposicao).toBe("indice");
    expect(byName.list_templates?.efeito).toBe("leitura");
    expect(byName.get_template_schema?.efeito).toBe("leitura");
    expect(byName.create_template?.efeito).toBe("cofre");
    for (const tool of tools) expect(tool.exposicao).toBe("indice");
  });

  it("parses a molde note", () => {
    const parsed = parseTemplateNote("Templates/AI/x.md", "---\ntemplate_id: x\ndescription: X\ntarget_path: A/{{ t }}.md\nfields:\n  t: string\n---\n{{ t }}\n");
    expect(parsed.definition?.id).toBe("x");
  });
});
