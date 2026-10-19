import { afterEach, describe, expect, it } from "vitest";
import { ImageValue, SafeHtml } from "../../src/engine/image-value";
import { TemplateEngine, TemplateError } from "../../src/engine/template-engine";

describe("TemplateEngine", () => {
  const fixedNow = new Date("2026-10-19T15:30:45.000Z");

  afterEach(() => {
    delete (globalThis as { moment?: unknown }).moment;
  });

  describe("channels and HTML escaping", () => {
    it("renders Liquid in the obsidian channel without HTML escaping (&, <, >, quotes preserved)", () => {
      const engine = new TemplateEngine({ now: () => fixedNow });
      const out = engine.render(
        'Title: {{ title }} | Raw: {{ expr }}',
        {
          title: 'Tom & Jerry "Quote" \'Single\'',
          expr: "a < b && c > d",
        },
        "obsidian",
      );
      expect(out).toBe('Title: Tom & Jerry "Quote" \'Single\' | Raw: a < b && c > d');
      expect(out).not.toContain("&amp;");
      expect(out).not.toContain("&lt;");
    });

    it("escapes HTML in regular variables on the telegram channel while preserving SafeHtml from tables", () => {
      const engine = new TemplateEngine({ now: () => fixedNow });
      const out = engine.render(
        "<b>{{ title }}</b>\n{{ items | markdown_table }}\n{{ safe }}",
        {
          title: "Alert <script> & Co",
          items: {
            headers: ["Col <1>", "Val & 2"],
            rows: [["a < b", "c > d"]],
          },
          safe: new SafeHtml("<i>already safe</i>"),
        },
        "telegram",
      );

      expect(out).toContain("<b>Alert &lt;script&gt; &amp; Co</b>");
      expect(out).toContain("<pre>Col &lt;1&gt; | Val &amp; 2\n------- | -------\na &lt; b   | c &gt; d</pre>");
      expect(out).toContain("<i>already safe</i>");
    });
  });

  describe("plugin filters", () => {
    it("renders markdown_table filter with optional column ordering", () => {
      const engine = new TemplateEngine({ now: () => fixedNow });
      const out = engine.render(
        '{{ rows | markdown_table: "Ticket", "Status" }}',
        {
          rows: [
            { Status: "Done", Ticket: "ATL-1" },
            { Status: "In Progress", Ticket: "ATL-2" },
          ],
        },
        "obsidian",
      );
      expect(out).toBe(
        [
          "| Ticket | Status      |",
          "| :----- | :---------- |",
          "| ATL-1  | Done        |",
          "| ATL-2  | In Progress |",
        ].join("\n"),
      );
    });

    it("renders obsidian_image filter as wikilink and as classic Markdown link", () => {
      let classic = false;
      const engine = new TemplateEngine({
        now: () => fixedNow,
        classicMarkdownLinks: () => classic,
      });
      const img = new ImageValue("Attachments/diagram (1).png", "diagram (1).png");

      expect(engine.render("{{ img }}", { img })).toBe("![[diagram (1).png]]");
      expect(engine.render("{{ img | obsidian_image: 500 }}", { img })).toBe("![[diagram (1).png|500]]");
      expect(engine.render("{{ img | obsidian_image: width: 320 }}", { img })).toBe("![[diagram (1).png|320]]");
      expect(engine.render('{{ "![[manual.png|100]]" | obsidian_image: 400 }}', {})).toBe("![[manual.png|400]]");
      expect(engine.render("{{ img | obsidian_image: 500 }}", { img }, "telegram")).toBe("diagram (1).png");

      classic = true;
      expect(engine.render("{{ img | obsidian_image: 500 }}", { img })).toBe(
        "![|500](Attachments/diagram%20%281%29.png)",
      );
      expect(engine.render("{{ img | obsidian_image }}", { img })).toBe(
        "![](Attachments/diagram%20%281%29.png)",
      );

      expect(() => engine.render('{{ img | obsidian_image: "bad" }}', { img })).toThrow(TemplateError);
    });

    it("formats dates with date_fmt filter and {% now %} tag, plus today and now_iso built-in variables", () => {
      const localDate = new Date(2026, 9, 19, 14, 5, 9); // 2026-10-19 14:05:09 local time
      const engine = new TemplateEngine({ now: () => localDate });

      const out = engine.render(
        'Today={{ today }} | ISO={{ now_iso }} | Tag={% now "YYYY-MM-DD" %} | Filter={{ "now" | date_fmt: "DD/MM/YYYY HH:mm:ss" }} | Custom={{ dt | date_fmt: "YYYY/MM/DD" }}',
        { dt: new Date(2026, 0, 5, 8, 0, 0) },
      );

      expect(out).toContain("Today=2026-10-19");
      expect(out).toContain(`ISO=${localDate.toISOString()}`);
      expect(out).toContain("Tag=2026-10-19");
      expect(out).toContain("Filter=19/10/2026 14:05:09");
      expect(out).toContain("Custom=2026/01/05");

      expect(() => engine.render('{{ "not-a-date" | date_fmt: "YYYY-MM-DD" }}', {})).toThrow(TemplateError);
    });

    it("supports slug, safe_filename, md_escape, wikilink, and bullet_list filters", () => {
      const engine = new TemplateEngine({ now: () => fixedNow });

      expect(engine.render("{{ text | slug }}", { text: "Ação & Reação: Teste 01!" })).toBe("acao-reacao-teste-01");
      expect(engine.render("{{ text | safe_filename }}", { text: ' ..Relatório: "Q1/Q2"*?<>|#[].. ' })).toBe(
        "Relatório Q1 Q2",
      );
      expect(engine.render("{{ text | md_escape }}", { text: "*bold* [link](x) | #tag" })).toBe(
        "\\*bold\\* \\[link\\]\\(x\\) \\| \\#tag",
      );
      expect(engine.render("{{ page | wikilink }}", { page: "[[MOC - Projetos|Alias]]" })).toBe(
        "[[MOC - ProjetosAlias]]",
      );
      expect(engine.render("{{ page | wikilink }}", { page: "Nota Simples" })).toBe("[[Nota Simples]]");
      expect(engine.render("{{ blank_val | wikilink }}", { blank_val: "   " })).toBe("");
      expect(engine.render("{{ list | bullet_list }}", { list: ["First", "Second\nLine", 3] })).toBe(
        "- First\n- Second Line\n- 3",
      );
      expect(engine.render("{{ single | bullet_list }}", { single: "Only one" })).toBe("- Only one");
      expect(engine.render("{{ none | bullet_list }}", { none: "" })).toBe("");
    });
  });

  describe("security restrictions: blocked tags and resource limits", () => {
    it("blocks include, render, layout, and block tags", () => {
      const engine = new TemplateEngine({ now: () => fixedNow });
      for (const tag of [
        '{% include "secret.md" %}',
        '{% render "secret.md" %}',
        '{% layout "base.md" %}',
        "{% block content %}hi{% endblock %}",
      ]) {
        const res = engine.validate(tag);
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.error).toBeInstanceOf(TemplateError);
          expect(res.error.kind).toBe("syntax");
        }
        expect(() => engine.render(tag, {})).toThrow(TemplateError);
      }
    });

    it("enforces parseLimit, renderLimit, and memoryLimit", () => {
      const smallParseEngine = new TemplateEngine({
        limits: { parseLimit: 20 },
      });
      expect(() => smallParseEngine.render("{{ 'a very long template source exceeding twenty chars' }}", {})).toThrow(
        /limit/i,
      );

      const smallMemoryEngine = new TemplateEngine({
        limits: { memoryLimit: 100 },
      });
      expect(() =>
        smallMemoryEngine.render("{% for i in (1..5000) %}{{ i }}{% endfor %}", {}),
      ).toThrow(TemplateError);

      const smallRenderEngine = new TemplateEngine({
        limits: { renderLimit: 1 },
      });
      expect(() =>
        smallRenderEngine.render(
          "{% for i in (1..100000) %}{% for j in (1..1000) %}{{ i }}{% endfor %}{% endfor %}",
          {},
        ),
      ).toThrow(TemplateError);
    });
  });

  describe("validate", () => {
    it("extracts global variables while ignoring loop and assign variables", () => {
      const engine = new TemplateEngine();
      const res = engine.validate(
        "{% assign local_var = 10 %}# {{ titulo }}\n{% for item in itens %}{{ item.nome }} {{ extra }}{% endfor %}{{ local_var }}",
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.variables.sort()).toEqual(["extra", "itens", "titulo"]);
      }
    });

    it("reports syntax errors with line and column numbers", () => {
      const engine = new TemplateEngine();
      const res = engine.validate("Line 1\nLine 2 {% if unclosed %}\nLine 3");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.kind).toBe("syntax");
        expect(res.error.line).toBeDefined();
        expect(res.error.column).toBeDefined();
        expect(res.error.message).toMatch(/line \d+, column \d+/);
      }
    });
  });
});
