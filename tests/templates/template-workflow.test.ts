import * as nodePath from "node:path";
import { describe, expect, it } from "vitest";
import type { HubCallContext, HubRequest } from "../../src/ecosystem/types";
import { TemplateEngine } from "../../src/engine/template-engine";
import { TemplateNotFoundError, UserError } from "../../src/errors";
import { AttachmentService } from "../../src/storage/attachment-service";
import { NoteCreator } from "../../src/storage/note-creator";
import type { FsPort } from "../../src/storage/path-guard";
import { TemplateCreator } from "../../src/templates/template-creator";
import { TemplateLoader } from "../../src/templates/template-loader";
import { parseFields, parseTemplateNote } from "../../src/templates/template-parser";
import { TemplateService } from "../../src/templates/template-service";
import { checkDefinition } from "../../src/templates/template-validator";
import { buildRoutes, buildTools } from "../../src/tools/templates-module";
import { DEFAULT_SETTINGS, type AITemplatesSettings } from "../../src/types/template-types";
import { MemoryVault } from "../storage/attachment-and-notes.test";

const CALL_CTX: HubCallContext = {
  client: { id: "claude-code", name: "Claude Code" },
  moduleId: "ai-templates",
};

function makeRequest(partial: Partial<HubRequest>): HubRequest {
  return {
    method: partial.method ?? "GET",
    path: partial.path ?? "/",
    fullPath: partial.fullPath ?? "/",
    params: partial.params ?? {},
    query: partial.query ?? {},
    headers: partial.headers ?? {},
    body: partial.body ?? {},
    rawBody: partial.rawBody ?? "",
    client: { id: "test-client", name: "Test Client" },
  };
}

describe("template-workflow", () => {
  describe("parseFields and parseTemplateNote", () => {
    it("parses valid YAML frontmatter and Liquid body, including shorthand and full field specs", () => {
      const md = [
        "---",
        "template_id: sprint_review",
        "description: Sprint review summary",
        "target_path: Sprints/{{ sprint | slug }}.md",
        "collision_rule: overwrite",
        "fields:",
        "  sprint:",
        "    type: string",
        "    required: true",
        "    description: Sprint name",
        "  velocity: number",
        "  tasks:",
        "    type: table",
        "    columns: [Key, Status]",
        "---",
        "",
        "# Sprint {{ sprint }}",
        "Velocity: {{ velocity }}",
        "{{ tasks | markdown_table }}",
      ].join("\n");

      const parsed = parseTemplateNote("Templates/AI/sprint_review.md", md);
      expect(parsed.isTemplate).toBe(true);
      expect(parsed.problems).toEqual([]);
      expect(parsed.definition).toEqual({
        id: "sprint_review",
        description: "Sprint review summary",
        targetPath: "Sprints/{{ sprint | slug }}.md",
        collisionRule: "overwrite",
        fields: [
          { name: "sprint", type: "string", required: true, description: "Sprint name", columns: undefined, default: undefined },
          { name: "velocity", type: "number", required: false, description: undefined, columns: undefined, default: undefined },
          { name: "tasks", type: "table", required: false, description: undefined, columns: ["Key", "Status"], default: undefined },
        ],
        body: "# Sprint {{ sprint }}\nVelocity: {{ velocity }}\n{{ tasks | markdown_table }}",
        sourcePath: "Templates/AI/sprint_review.md",
      });
    });

    it("ignores regular notes without template_id and reports invalid IDs, field names, and field types", () => {
      const plain = parseTemplateNote("Templates/AI/README.md", "---\ntitle: Just a note\n---\nHello");
      expect(plain.isTemplate).toBe(false);

      const badId = parseTemplateNote(
        "Templates/AI/bad.md",
        "---\ntemplate_id: 'invalid id with spaces!'\ndescription: Test\n---\nBody",
      );
      expect(badId.isTemplate).toBe(true);
      expect(badId.definition).toBeUndefined();
      expect(badId.problems[0]?.level).toBe("error");

      const badFields = parseFields({
        "123bad": { type: "string" },
        good_name: { type: "unknown_type" },
        non_table_cols: { type: "string", columns: ["A"] },
      });
      expect(badFields.errors).toHaveLength(3);
    });
  });

  describe("checkDefinition", () => {
    const engine = new TemplateEngine();

    it("cross-checks variables in body and target_path against declared fields (strictDeclared true vs false)", () => {
      const def = {
        id: "test_tpl",
        description: "Test",
        targetPath: "Logs/{{ today }}-{{ undeclared_path | slug }}.md",
        fields: [
          { name: "declared_used", type: "string" as const, required: true },
          { name: "declared_unused", type: "string" as const, required: false },
        ],
        body: "# {{ declared_used }}\n{{ undeclared_body }}\n{{ now_iso }}",
        sourcePath: "Templates/AI/test_tpl.md",
      };

      const loose = checkDefinition(def, engine, { strictDeclared: false, configDir: ".obsidian" });
      expect(loose.errors).toEqual([]);
      expect(loose.warnings.some((w) => w.includes('"undeclared_body"'))).toBe(true);
      expect(loose.warnings.some((w) => w.includes('"undeclared_path"'))).toBe(true);
      expect(loose.warnings.some((w) => w.includes('"declared_unused"'))).toBe(true);

      const strict = checkDefinition(def, engine, { strictDeclared: true, configDir: ".obsidian" });
      expect(strict.errors.some((e) => e.includes('"undeclared_body"'))).toBe(true);
      expect(strict.errors.some((e) => e.includes('"undeclared_path"'))).toBe(true);
    });
  });

  describe("TemplateLoader, TemplateCreator, TemplateService, Tools, and Routes", () => {
    function setupFullStack() {
      const fixedDate = new Date(2026, 9, 19, 12, 0, 0);
      const vault = new MemoryVault();
      const settings: AITemplatesSettings = { ...DEFAULT_SETTINGS };
      const engine = new TemplateEngine({
        now: () => fixedDate,
        classicMarkdownLinks: () => settings.classicMarkdownLinks,
      });
      const notes = new NoteCreator(vault);
      const tmpDir = nodePath.resolve("/tmp/ai-workflow");
      const fs: FsPort = {
        tmpdir: () => tmpDir,
        realpath: async (p) => nodePath.resolve(p),
        stat: async () => ({ isFile: true, size: 12 }),
        readFile: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
      };
      const attachments = new AttachmentService({
        vault,
        fs,
        getAllowedFolders: () => settings.allowedImageFolders,
        getBase64LimitMb: () => settings.base64LimitMb,
        ensureFolder: (dir) => notes.ensureFolder(dir),
      });
      const loader = new TemplateLoader({
        vault,
        engine,
        getFolder: () => settings.templatesFolder,
      });
      const creator = new TemplateCreator({
        vault,
        engine,
        loader,
        notes,
        getFolder: () => settings.templatesFolder,
      });
      const activities: unknown[] = [];
      const service = new TemplateService({
        vault,
        engine,
        loader,
        attachments,
        notes,
        creator,
        getSettings: () => settings,
        logActivity: (entry) => activities.push(entry),
        now: () => fixedDate.getTime(),
      });
      const tools = buildTools(service, loader);
      const routes = buildRoutes(service, loader);

      const callTool = (name: string, args: Record<string, unknown> = {}) => {
        const tool = tools.find((t) => t.name === name);
        if (!tool) throw new Error(`Tool ${name} not found`);
        return tool.handler(args, CALL_CTX);
      };

      return { vault, settings, engine, loader, creator, service, tools, routes, callTool, activities };
    }

    it("caches loaded templates, supports invalidate(), and warns on duplicate template_id", async () => {
      const { vault, loader } = setupFullStack();

      await vault.createText(
        "Templates/AI/a.md",
        "---\ntemplate_id: dup_id\ndescription: First\nfields:\n  x: string\n---\n{{ x }}",
      );
      await vault.createText(
        "Templates/AI/b.md",
        "---\ntemplate_id: dup_id\ndescription: Second\nfields:\n  x: string\n---\n{{ x }}",
      );

      const firstLoad = await loader.load();
      expect(firstLoad.templates).toHaveLength(1);
      expect(firstLoad.templates[0]?.description).toBe("First");
      expect(firstLoad.problems.some((p) => p.message.includes('already used by "Templates/AI/a.md"'))).toBe(true);

      // Cached until invalidated
      await vault.createText(
        "Templates/AI/c.md",
        "---\ntemplate_id: third_id\ndescription: Third\nfields:\n  x: string\n---\n{{ x }}",
      );
      expect(await loader.list()).toHaveLength(1);

      loader.invalidate();
      expect(await loader.list()).toHaveLength(2);
      await expect(loader.require("missing")).rejects.toThrow(TemplateNotFoundError);
    });

    it("creates and updates templates via TemplateCreator, and rejects undeclared variables or syntax errors", async () => {
      const { creator, loader } = setupFullStack();

      const created = await creator.create({
        templateId: "daily_log",
        description: "Daily log with task table",
        targetPath: "Logs/{{ today }}-{{ titulo | slug }}.md",
        fields: {
          titulo: { type: "string", required: true },
          tarefas: { type: "table", columns: ["Ticket", "Status"] },
        },
        markdownBody: "# {{ titulo }}\n\n{{ tarefas | markdown_table }}\n",
      });
      expect(created.created).toBe(true);
      expect(created.path).toBe("Templates/AI/daily_log.md");

      // Replace existing template with same id
      const updated = await creator.create({
        templateId: "daily_log",
        description: "Updated daily log",
        targetPath: "Logs/{{ today }}-{{ titulo | slug }}.md",
        fields: {
          titulo: { type: "string", required: true },
        },
        markdownBody: "# {{ titulo }} (v2)\n",
      });
      expect(updated.created).toBe(false);
      const found = await loader.require("daily_log");
      expect(found.description).toBe("Updated daily log");

      // Reject undeclared variable in body
      await expect(
        creator.create({
          templateId: "broken_vars",
          description: "Broken",
          targetPath: "Logs/test.md",
          fields: { a: { type: "string" } },
          markdownBody: "{{ a }} {{ undeclared }}",
        }),
      ).rejects.toThrow(UserError);

      // Reject Liquid syntax error
      await expect(
        creator.create({
          templateId: "broken_syntax",
          description: "Broken",
          targetPath: "Logs/test.md",
          fields: { a: { type: "string" } },
          markdownBody: "{% if a %}unclosed",
        }),
      ).rejects.toThrow(UserError);
    });

    it("runs full end-to-end workflow across MCP tools and REST routes (create_template, list_templates, get_template_schema, preview_template, create_note_from_template with data and data_file)", async () => {
      const { vault, routes, callTool } = setupFullStack();

      // 1. create_template via MCP tool
      const createRes = await callTool("create_template", {
        template_id: "relatorio_sprint",
        description: "Relatório de Sprint com tabela",
        target_path: "Relatorios/{{ today }}-{{ titulo | slug }}",
        fields: {
          titulo: { type: "string", required: true, description: "Título da sprint" },
          itens: { type: "table", required: true, columns: ["Ticket", "Status"] },
          nota_extra: { type: "string", required: false, default: "Sem observações" },
        },
        markdown_body: "# {{ titulo }}\n\n{{ itens | markdown_table }}\n\nObs: {{ nota_extra }}",
      });
      expect(createRes.isError).toBeUndefined();
      expect(createRes.structuredContent?.created).toBe(true);

      // 2. list_templates via MCP tool and GET /templates route
      const listToolRes = await callTool("list_templates");
      expect(listToolRes.structuredContent?.templates).toEqual([
        { id: "relatorio_sprint", description: "Relatório de Sprint com tabela" },
      ]);

      const getTemplatesRoute = routes.find((r) => r.method === "GET" && r.path === "/templates")!;
      const listRouteRes = await getTemplatesRoute.handler(makeRequest({ method: "GET", path: "/templates" }));
      expect(listRouteRes.status).toBe(200);

      // 3. get_template_schema via MCP tool and GET /templates/:id route
      const schemaToolRes = await callTool("get_template_schema", { template_id: "relatorio_sprint" });
      expect(schemaToolRes.structuredContent?.id).toBe("relatorio_sprint");
      expect(schemaToolRes.structuredContent?.example).toHaveProperty("titulo");

      const getSchemaRoute = routes.find((r) => r.method === "GET" && r.path === "/templates/:id")!;
      const schemaRouteRes = await getSchemaRoute.handler(
        makeRequest({ method: "GET", path: "/templates/relatorio_sprint", params: { id: "relatorio_sprint" } }),
      );
      expect(schemaRouteRes.status).toBe(200);

      // 4. preview_template via MCP tool and POST /render (obsidian + telegram channels)
      const previewRes = await callTool("preview_template", {
        template_id: "relatorio_sprint",
        data: {
          titulo: "Sprint 42 & Revisão",
          itens: [{ Ticket: "ATL-1", Status: "Done | Validated" }],
        },
      });
      expect(previewRes.isError).toBeUndefined();
      expect(previewRes.structuredContent?.target_path).toBe("Relatorios/2026-10-19-sprint-42-revisao.md");
      expect(previewRes.structuredContent?.markdown).toContain("# Sprint 42 & Revisão");
      expect(previewRes.structuredContent?.markdown).toContain("| ATL-1  | Done \\| Validated |");

      const renderRoute = routes.find((r) => r.method === "POST" && r.path === "/render")!;
      const tgRenderRes = await renderRoute.handler(
        makeRequest({
          method: "POST",
          path: "/render",
          body: {
            template_id: "relatorio_sprint",
            channel: "telegram",
            data: {
              titulo: "Sprint <42>",
              itens: [{ Ticket: "ATL-1", Status: "A & B" }],
            },
          },
        }),
      );
      expect(tgRenderRes.status).toBe(200);
      const tgBody = tgRenderRes.body as { markdown: string };
      expect(tgBody.markdown).toContain("# Sprint &lt;42&gt;");
      expect(tgBody.markdown).toContain("<pre>");

      // 5. create_note_from_template using data_file + data override + dynamic target_path
      await vault.createText(
        "Temp/payload.json",
        JSON.stringify({
          titulo: "Do Arquivo",
          itens: [
            { Ticket: "ATL-10", Status: "Concluído" },
            { Ticket: "ATL-11", Status: "Em Progresso" },
          ],
          nota_extra: "Vindo do data_file",
        }),
      );

      const noteToolRes = await callTool("create_note_from_template", {
        template_id: "relatorio_sprint",
        data_file: "Temp/payload.json",
        data: {
          titulo: "Sprint Sobrescrita",
        },
      });
      expect(noteToolRes.isError).toBeUndefined();
      expect(noteToolRes.structuredContent?.file_path).toBe("Relatorios/2026-10-19-sprint-sobrescrita.md");

      const savedNote = await vault.readText("Relatorios/2026-10-19-sprint-sobrescrita.md");
      expect(savedNote).toContain("# Sprint Sobrescrita");
      expect(savedNote).toContain("Obs: Vindo do data_file");
      expect(savedNote).toContain("| ATL-10 | Concluído    |");

      // 6. POST /notes route with collision incremental rename
      const postNotesRoute = routes.find((r) => r.method === "POST" && r.path === "/notes")!;
      const routeNoteRes = await postNotesRoute.handler(
        makeRequest({
          method: "POST",
          path: "/notes",
          body: {
            template_id: "relatorio_sprint",
            data_file: "Temp/payload.json",
            data: { titulo: "Sprint Sobrescrita" },
          },
        }),
      );
      expect(routeNoteRes.status).toBe(201);
      const routeNoteBody = routeNoteRes.body as { file_path: string; renamed: boolean };
      expect(routeNoteBody.file_path).toBe("Relatorios/2026-10-19-sprint-sobrescrita 1.md");
      expect(routeNoteBody.renamed).toBe(true);
    });
  });
});
