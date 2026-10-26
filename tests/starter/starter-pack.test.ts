import { describe, expect, it } from "vitest";
import { TemplateEngine } from "../../src/engine/template-engine";
import type { Lang } from "../../src/i18n";
import { validateData } from "../../src/templates/field-data";
import { buildSchema } from "../../src/templates/schema";
import { parseTemplateNote } from "../../src/templates/template-parser";
import { checkDefinition } from "../../src/templates/template-validator";
import { STARTER_TEMPLATES, STARTER_TEMPLATE_IDS, installStarterPack } from "../../src/starter/starter-pack";
import type { TemplateDefinition } from "../../src/types/template-types";
import { MemoryVault } from "../storage/attachment-and-notes.test";
import { parseYaml } from "../mocks/obsidian";

const LOCALES: Lang[] = ["pt", "en"];
const FOLDER = "Templates/AI";
const FIXED_NOW = new Date("2026-10-26T12:00:00");
const engine = new TemplateEngine({ now: () => FIXED_NOW });

// Names that must never appear in the generic kit.
const REAL_NAMES = /\b(csp|telecall|a5x|everllence|fgc|emanuell|pires)\b/i;

function definitionOf(id: string, locale: Lang): TemplateDefinition {
  const tpl = STARTER_TEMPLATES.find((item) => item.id === id);
  if (!tpl) throw new Error(`missing ${id}`);
  const parsed = parseTemplateNote(`${FOLDER}/${id}.md`, tpl.content[locale]);
  expect(parsed.problems).toEqual([]);
  if (!parsed.definition) throw new Error(`${id} did not parse`);
  return parsed.definition;
}

function renderWith(def: TemplateDefinition, raw: Record<string, unknown>): string {
  const check = validateData(def.fields, raw, { now: () => FIXED_NOW });
  expect(check.errors).toEqual([]);
  expect(check.warnings).toEqual([]);
  return engine.render(def.body, check.data);
}

describe("starter pack", () => {
  it("has the seven agreed templates with stable ids", () => {
    expect(STARTER_TEMPLATE_IDS).toEqual([
      "nota_reuniao",
      "nota_diaria",
      "revisao_semanal",
      "nota_pessoa",
      "registro_decisao",
      "receita_processo",
      "briefing_ia",
    ]);
  });

  for (const locale of LOCALES) {
    describe(`templates in ${locale}`, () => {
      for (const tpl of STARTER_TEMPLATES) {
        describe(tpl.id, () => {
          it("passes the parser and the validator with no errors or warnings", () => {
            const def = definitionOf(tpl.id, locale);
            expect(def.id).toBe(tpl.id);
            expect(def.description.length).toBeGreaterThan(20);
            expect(def.collisionRule).toBe("incremental");
            expect(def.targetPath).toBeDefined();
            for (const field of def.fields) expect(field.description, field.name).toBeTruthy();
            const check = checkDefinition(def, engine, { strictDeclared: true, configDir: ".obsidian" });
            expect(check.errors).toEqual([]);
            expect(check.warnings).toEqual([]);
          });

          it("has no real client, company or person names", () => {
            expect(tpl.content[locale]).not.toMatch(REAL_NAMES);
          });

          it("renders the schema example with a valid note, target path and frontmatter", () => {
            const def = definitionOf(tpl.id, locale);
            const example = buildSchema(def, "incremental").example;
            const out = renderWith(def, example);
            expect(out.startsWith("---\ntags:\n")).toBe(true);
            expect(out).not.toMatch(/\{\{|\{%|undefined|\[object/);
            expect(out).not.toMatch(/\n{3,}/);
            const front = /^---\n([\s\S]*?)\n---\n/.exec(out);
            expect(front).not.toBeNull();
            const parsed = parseYaml(front?.[1] ?? "") as { tags?: unknown };
            expect(Array.isArray(parsed.tags)).toBe(true);

            const target = engine.render(def.targetPath ?? "", validateData(def.fields, example).data);
            expect(target).toMatch(/\.md$/);
            expect(target).not.toMatch(/\{\{|\{%/);
          });

          it("renders with only the required fields, dropping the empty sections", () => {
            const def = definitionOf(tpl.id, locale);
            const example = buildSchema(def, "incremental").example;
            const required: Record<string, unknown> = {};
            for (const field of def.fields) if (field.required) required[field.name] = example[field.name];
            const out = renderWith(def, required);
            expect(out).not.toMatch(/\{\{|\{%|undefined|\[object/);
            expect(out).not.toMatch(/\n{3,}/);
            expect(out.endsWith("\n")).toBe(true);
          });
        });
      }
    });
  }

  it("renders the meeting note and the daily note as expected", () => {
    const meeting = renderWith(definitionOf("nota_reuniao", "pt"), {
      titulo: "Alinhamento do projeto Alfa",
      data: "2026-10-20T12:00",
      participantes: ["Ana Exemplo", "Bruno Exemplo"],
      acoes: [{ Ação: "Enviar proposta", Responsável: "Ana", Prazo: "2026-10-30" }],
      up: "[[MOC - Reuniões]]",
    });
    expect(
      meeting.startsWith(
        '---\ntags:\n  - reuniao\ndata: 2026-10-20\nup: "[[MOC - Reuniões]]"\n---\n\n# Alinhamento do projeto Alfa\n\n',
      ),
    ).toBe(true);
    expect(meeting).toContain("- **Data:** 20/10/2026\n- **Participantes:** Ana Exemplo, Bruno Exemplo\n\n## Ações\n\n| Ação");
    expect(meeting).toContain("Enviar proposta");
    expect(meeting).not.toContain("## Pauta");
  });

  it("turns the daily tasks into open checkboxes and numbers the process steps", () => {
    const daily = renderWith(definitionOf("nota_diaria", "en"), { tasks: ["Write report", "Call Acme"] });
    expect(daily).toContain("## Tasks\n\n- [ ] Write report\n- [ ] Call Acme\n");
    expect(daily).toContain("date: 2026-10-26");

    const recipe = renderWith(definitionOf("receita_processo", "pt"), {
      nome: "Publicar o relatório",
      objetivo: "Relatório publicado.",
      passos: ["Gerar o arquivo", "Enviar ao time"],
    });
    expect(recipe).toContain("## Passos\n\n1. Gerar o arquivo\n2. Enviar ao time\n");
  });
});

describe("installStarterPack", () => {
  const pathOf = (id: string): string => `${FOLDER}/${id}.md`;

  it("installs every template in the requested language and returns the ids", async () => {
    const vault = new MemoryVault();
    const installed = await installStarterPack({ vault, folder: FOLDER, installedIds: [], locale: "pt" });
    expect(installed).toEqual([...STARTER_TEMPLATE_IDS]);
    for (const tpl of STARTER_TEMPLATES) expect(vault.files.get(pathOf(tpl.id))).toBe(tpl.content.pt);

    const english = new MemoryVault();
    await installStarterPack({ vault: english, folder: FOLDER, installedIds: [], locale: "en" });
    expect(english.files.get(pathOf("nota_reuniao"))).toBe(STARTER_TEMPLATES[0]?.content.en);
  });

  it("is idempotent", async () => {
    const vault = new MemoryVault();
    await installStarterPack({ vault, folder: FOLDER, installedIds: [], locale: "en" });
    const again = await installStarterPack({ vault, folder: FOLDER, installedIds: [], locale: "en" });
    expect(again).toEqual([]);
    expect(vault.files.size).toBe(STARTER_TEMPLATES.length);
  });

  it("never overwrites an existing file", async () => {
    const vault = new MemoryVault();
    vault.files.set(pathOf("nota_reuniao"), "my own note");
    const installed = await installStarterPack({ vault, folder: FOLDER, installedIds: [], locale: "pt" });
    expect(installed).not.toContain("nota_reuniao");
    expect(vault.files.get(pathOf("nota_reuniao"))).toBe("my own note");
  });

  it("does not duplicate a template_id that another note of the folder already uses", async () => {
    const vault = new MemoryVault();
    vault.files.set(`${FOLDER}/Sub/Minha reunião.md`, "---\ntemplate_id: nota_reuniao\ndescription: mine\n---\n\nbody\n");
    const installed = await installStarterPack({ vault, folder: FOLDER, installedIds: [], locale: "pt" });
    expect(installed).not.toContain("nota_reuniao");
    expect(vault.kind(pathOf("nota_reuniao"))).toBeUndefined();
  });

  it("does not recreate a template that was installed before and then deleted", async () => {
    const vault = new MemoryVault();
    const installedIds = ["nota_reuniao", "nota_diaria"];
    const installed = await installStarterPack({ vault, folder: FOLDER, installedIds, locale: "pt" });
    expect(installed).toEqual(STARTER_TEMPLATE_IDS.filter((id) => !installedIds.includes(id)));
    expect(vault.kind(pathOf("nota_reuniao"))).toBeUndefined();
    expect(vault.kind(pathOf("nota_diaria"))).toBeUndefined();
  });

  it("installs ids that are new to the history and restores everything with an empty history", async () => {
    const vault = new MemoryVault();
    const allButOne = STARTER_TEMPLATE_IDS.slice(0, -1);
    const installed = await installStarterPack({ vault, folder: FOLDER, installedIds: allButOne, locale: "en" });
    expect(installed).toEqual(["briefing_ia"]);

    const restored = await installStarterPack({ vault, folder: FOLDER, installedIds: [], locale: "en" });
    expect(restored).toEqual(allButOne);
    expect(vault.files.size).toBe(STARTER_TEMPLATES.length);
  });

  it("creates the folder, and the installed notes load as templates", async () => {
    const vault = new MemoryVault();
    await installStarterPack({ vault, folder: FOLDER, installedIds: [], locale: "pt" });
    expect(vault.kind("Templates")).toBe("folder");
    expect(vault.kind(FOLDER)).toBe("folder");
    for (const path of vault.files.keys()) {
      const parsed = parseTemplateNote(path, vault.files.get(path) ?? "");
      expect(parsed.definition?.id).toBeDefined();
    }
  });
});
