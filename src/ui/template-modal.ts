// Interactive template manager and live tester modal.
import { Modal, Notice, Setting, setIcon } from "obsidian";
import type { App } from "obsidian";
import { errorMessage } from "../errors";
import { t } from "../i18n";
import { buildSchema } from "../templates/schema";
import type { LoadResult, TemplateLoader } from "../templates/template-loader";
import type { TemplateService } from "../templates/template-service";
import type {
  AITemplatesSettings,
  RenderChannel,
  TemplateDefinition,
} from "../types/template-types";

export interface TemplateModalDeps {
  loader: TemplateLoader;
  service: TemplateService;
  getSettings: () => AITemplatesSettings;
  openNote: (path: string) => Promise<void>;
}

const STARTER_ID = "daily_report";
const STARTER_DESCRIPTION = "Daily report with summary, tasks table and optional notes.";
const STARTER_TARGET_PATH = "Reports/{% now 'YYYY-MM-DD' %}-{{ title | slug }}.md";
const STARTER_FIELDS = {
  title: { type: "string", required: true, description: "Report title." },
  author: { type: "string", required: false, default: "AI Agent", description: "Who generated the report." },
  tasks: {
    type: "table",
    required: true,
    columns: ["Task", "Status", "Owner"],
    description: "Tasks completed or in progress.",
  },
  notes: { type: "string", required: false, description: "Optional observations." },
};
const STARTER_BODY = [
  "# {{ title }}",
  "",
  "- **Date:** {{ today }}",
  "- **Author:** {{ author }}",
  "",
  "## Tasks",
  "",
  "{{ tasks | markdown_table }}",
  "{% if notes %}",
  "## Notes",
  "",
  "{{ notes }}",
  "{% endif %}",
].join("\n");

export class TemplateManagerModal extends Modal {
  private loadResult: LoadResult = { templates: [], problems: [] };
  private selectedId: string | undefined;
  private channel: RenderChannel = "obsidian";
  private targetPathOverride = "";
  private jsonInput = "{}";

  private listContainerEl: HTMLElement | undefined;
  private detailContainerEl: HTMLElement | undefined;
  private jsonAreaEl: HTMLTextAreaElement | undefined;
  private previewMetaEl: HTMLElement | undefined;
  private previewWarningsEl: HTMLElement | undefined;
  private previewOutputEl: HTMLElement | undefined;

  constructor(
    app: App,
    private readonly deps: TemplateModalDeps,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl, modalEl } = this;
    modalEl.addClass("ait-manager-modal");
    contentEl.addClass("ait-modal");

    const titleIcon = titleEl.createSpan({ cls: "ait-modal-icon" });
    setIcon(titleIcon, "file-spreadsheet");
    titleEl.appendText(t("modal.title"));

    const toolbar = contentEl.createDiv({ cls: "ait-modal-toolbar" });
    new Setting(toolbar)
      .addButton((btn) =>
        btn
          .setButtonText(t("modal.createStarter"))
          .setIcon("sparkles")
          .onClick(() => void this.createStarterTemplate()),
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("modal.reload"))
          .setIcon("refresh-cw")
          .onClick(() => void this.reload(true)),
      );

    const layout = contentEl.createDiv({ cls: "ait-manager-layout" });
    this.listContainerEl = layout.createDiv({ cls: "ait-manager-sidebar" });
    this.detailContainerEl = layout.createDiv({ cls: "ait-manager-main" });

    void this.reload(false);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async reload(announce: boolean): Promise<void> {
    this.deps.loader.invalidate();
    this.loadResult = await this.deps.loader.load();
    if (announce) {
      const count = this.loadResult.templates.length;
      const problems = this.loadResult.problems.length;
      new Notice(
        problems > 0
          ? t("core.notice.reloadedProblems", { count, problems })
          : t("core.notice.reloaded", { count }),
      );
    }
    const currentExists = this.loadResult.templates.some((tpl) => tpl.id === this.selectedId);
    if (!currentExists) {
      const first = this.loadResult.templates[0];
      this.selectTemplate(first);
    } else {
      const current = this.loadResult.templates.find((tpl) => tpl.id === this.selectedId);
      this.renderSidebar();
      this.renderDetail(current);
    }
  }

  private selectTemplate(def: TemplateDefinition | undefined): void {
    this.selectedId = def?.id;
    this.targetPathOverride = "";
    if (def) {
      const schema = buildSchema(def, this.deps.getSettings().defaultCollisionRule);
      this.jsonInput = JSON.stringify(schema.example, null, 2);
    } else {
      this.jsonInput = "{}";
    }
    this.renderSidebar();
    this.renderDetail(def);
  }

  private renderSidebar(): void {
    const container = this.listContainerEl;
    if (!container) return;
    container.empty();

    const { templates, problems } = this.loadResult;
    container.createDiv({
      cls: "ait-section-title",
      text: t("modal.templatesHeading", { count: templates.length }),
    });

    if (templates.length === 0) {
      container.createDiv({
        cls: "ait-empty-state",
        text: t("modal.empty", { folder: this.deps.getSettings().templatesFolder }),
      });
    } else {
      const list = container.createDiv({ cls: "ait-template-list" });
      for (const tpl of templates) {
        const item = list.createDiv({
          cls: `ait-template-item${tpl.id === this.selectedId ? " is-active" : ""}`,
        });
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        const idRow = item.createDiv({ cls: "ait-template-item-id ait-mono", text: tpl.id });
        const iconSpan = createSpan({ cls: "ait-template-item-icon" });
        setIcon(iconSpan, "file-code");
        idRow.prepend(iconSpan);
        item.createDiv({ cls: "ait-template-item-desc", text: tpl.description });
        item.addEventListener("click", () => this.selectTemplate(tpl));
        item.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter" || evt.key === " ") {
            evt.preventDefault();
            this.selectTemplate(tpl);
          }
        });
      }
    }

    if (problems.length > 0) {
      container.createDiv({
        cls: "ait-section-title ait-section-title-spaced",
        text: t("modal.problemsHeading", { count: problems.length }),
      });
      const problemsBox = container.createDiv({ cls: "ait-problems-list" });
      for (const problem of problems) {
        const row = problemsBox.createDiv({ cls: `ait-problem-item ait-problem-${problem.level}` });
        const iconSpan = row.createSpan({ cls: "ait-problem-icon" });
        setIcon(iconSpan, problem.level === "error" ? "x-circle" : "alert-triangle");
        const body = row.createDiv({ cls: "ait-problem-body" });
        body.createDiv({ cls: "ait-mono ait-problem-path", text: problem.path });
        body.createDiv({ cls: "ait-problem-message", text: problem.message });
      }
    }
  }

  private renderDetail(def: TemplateDefinition | undefined): void {
    const container = this.detailContainerEl;
    if (!container) return;
    container.empty();

    if (!def) {
      container.createDiv({
        cls: "ait-empty-state",
        text: t("modal.empty", { folder: this.deps.getSettings().templatesFolder }),
      });
      return;
    }

    const header = container.createDiv({ cls: "ait-detail-header" });
    const titleGroup = header.createDiv();
    titleGroup.createEl("h3", { cls: "ait-mono ait-detail-title", text: def.id });
    titleGroup.createEl("p", { cls: "ait-muted ait-detail-desc", text: def.description });

    const actions = header.createDiv({ cls: "ait-detail-actions" });
    const openBtn = actions.createEl("button", { cls: "ait-btn" });
    const openIcon = openBtn.createSpan({ cls: "ait-btn-icon" });
    setIcon(openIcon, "external-link");
    openBtn.createSpan({ text: t("modal.openNote") });
    openBtn.addEventListener("click", () => {
      void this.deps.openNote(def.sourcePath);
      this.close();
    });

    const metaGrid = container.createDiv({ cls: "ait-meta-grid" });
    this.addMetaCell(metaGrid, t("modal.meta.id"), def.id, true);
    this.addMetaCell(
      metaGrid,
      t("modal.meta.targetPath"),
      def.targetPath ?? t("modal.meta.targetPathNone"),
      Boolean(def.targetPath),
    );
    this.addMetaCell(
      metaGrid,
      t("modal.meta.collisionRule"),
      def.collisionRule ?? this.deps.getSettings().defaultCollisionRule,
      true,
    );
    this.addMetaCell(metaGrid, t("modal.meta.sourcePath"), def.sourcePath, true);

    container.createDiv({
      cls: "ait-section-title",
      text: t("modal.meta.fields", { count: def.fields.length }),
    });
    if (def.fields.length === 0) {
      container.createDiv({ cls: "ait-empty-state", text: t("modal.meta.noFields") });
    } else {
      const fieldsList = container.createDiv({ cls: "ait-fields-list" });
      for (const field of def.fields) {
        const badgeRow = fieldsList.createDiv({ cls: "ait-field-row" });
        badgeRow.createSpan({ cls: "ait-mono ait-field-name", text: field.name });
        badgeRow.createSpan({ cls: "ait-badge", text: field.type });
        badgeRow.createSpan({
          cls: `ait-badge ${field.required ? "ait-badge-required" : ""}`,
          text: field.required ? t("modal.meta.required") : t("modal.meta.optional"),
        });
        if (field.columns && field.columns.length > 0) {
          badgeRow.createSpan({
            cls: "ait-muted ait-field-extra",
            text: t("modal.meta.columns", { columns: field.columns.join(", ") }),
          });
        }
        if (field.description) {
          badgeRow.createDiv({ cls: "ait-field-desc", text: field.description });
        }
      }
    }

    this.renderTester(container, def);
  }

  private addMetaCell(parent: HTMLElement, label: string, value: string, mono: boolean): void {
    const cell = parent.createDiv({ cls: "ait-meta-cell" });
    cell.createDiv({ cls: "ait-meta-label", text: label });
    cell.createDiv({ cls: `ait-meta-value${mono ? " ait-mono" : ""}`, text: value });
  }

  private renderTester(container: HTMLElement, def: TemplateDefinition): void {
    container.createDiv({
      cls: "ait-section-title ait-section-title-spaced",
      text: t("modal.tester.heading"),
    });

    const controls = container.createDiv({ cls: "ait-tester-controls" });

    new Setting(controls)
      .setName(t("modal.tester.channel"))
      .addDropdown((drop) => {
        drop
          .addOption("obsidian", t("modal.tester.channelObsidian"))
          .addOption("telegram", t("modal.tester.channelTelegram"))
          .setValue(this.channel)
          .onChange((val) => {
            this.channel = val as RenderChannel;
          });
      });

    new Setting(controls)
      .setName(t("modal.tester.targetPath"))
      .addText((text) => {
        text
          .setPlaceholder(t("modal.tester.targetPathPlaceholder"))
          .setValue(this.targetPathOverride)
          .onChange((val) => {
            this.targetPathOverride = val;
          });
      });

    const jsonHeader = container.createDiv({ cls: "ait-json-header" });
    jsonHeader.createSpan({ cls: "ait-meta-label", text: t("modal.tester.jsonLabel") });

    const jsonButtons = jsonHeader.createDiv({ cls: "ait-json-buttons" });
    const resetBtn = jsonButtons.createEl("button", { cls: "ait-btn" });
    const resetIcon = resetBtn.createSpan({ cls: "ait-btn-icon" });
    setIcon(resetIcon, "rotate-ccw");
    resetBtn.createSpan({ text: t("modal.tester.fillExample") });
    resetBtn.addEventListener("click", () => {
      const schema = buildSchema(def, this.deps.getSettings().defaultCollisionRule);
      this.jsonInput = JSON.stringify(schema.example, null, 2);
      if (this.jsonAreaEl) this.jsonAreaEl.value = this.jsonInput;
      void this.runPreview(def);
    });

    const renderBtn = jsonButtons.createEl("button", { cls: "ait-btn mod-cta" });
    const playIcon = renderBtn.createSpan({ cls: "ait-btn-icon" });
    setIcon(playIcon, "play");
    renderBtn.createSpan({ text: t("modal.tester.renderBtn") });
    renderBtn.addEventListener("click", () => void this.runPreview(def));

    this.jsonAreaEl = container.createEl("textarea", { cls: "ait-json-textarea ait-mono" });
    this.jsonAreaEl.rows = 8;
    this.jsonAreaEl.value = this.jsonInput;
    this.jsonAreaEl.addEventListener("input", () => {
      this.jsonInput = this.jsonAreaEl?.value ?? "";
    });

    this.previewMetaEl = container.createDiv({ cls: "ait-preview-meta ait-mono" });
    this.previewWarningsEl = container.createDiv({ cls: "ait-preview-warnings" });

    container.createDiv({ cls: "ait-meta-label", text: t("modal.tester.outputHeading") });
    this.previewOutputEl = container.createEl("pre", {
      cls: "ait-preview-output ait-mono",
      text: t("modal.tester.outputEmpty"),
    });

    void this.runPreview(def);
  }

  private async runPreview(def: TemplateDefinition): Promise<void> {
    if (!this.previewOutputEl || !this.previewMetaEl || !this.previewWarningsEl) return;
    this.previewWarningsEl.empty();
    this.previewOutputEl.removeClass("ait-preview-error");

    try {
      const result = await this.deps.service.preview({
        templateId: def.id,
        data: this.jsonInput,
        targetPath: this.targetPathOverride.trim() || undefined,
        channel: this.channel,
      });

      this.previewMetaEl.setText(
        result.targetPath
          ? t("modal.tester.resolvedPath", { path: result.targetPath })
          : t("modal.tester.noResolvedPath"),
      );

      if (result.warnings.length > 0) {
        const warnTitle = this.previewWarningsEl.createDiv({
          cls: "ait-warning-title",
          text: t("modal.tester.warnings", { count: result.warnings.length }),
        });
        const warnIcon = createSpan({ cls: "ait-problem-icon" });
        setIcon(warnIcon, "alert-triangle");
        warnTitle.prepend(warnIcon);
        for (const w of result.warnings) {
          this.previewWarningsEl.createDiv({ cls: "ait-warning-line", text: w });
        }
      }

      this.previewOutputEl.setText(result.markdown);
    } catch (err) {
      this.previewMetaEl.setText("");
      this.previewOutputEl.addClass("ait-preview-error");
      this.previewOutputEl.setText(errorMessage(err));
    }
  }

  private async createStarterTemplate(): Promise<void> {
    try {
      const created = await this.deps.service.createTemplate({
        templateId: STARTER_ID,
        description: STARTER_DESCRIPTION,
        targetPath: STARTER_TARGET_PATH,
        fields: STARTER_FIELDS,
        markdownBody: STARTER_BODY,
        collisionRule: "incremental",
      });
      new Notice(t("core.notice.starterCreated", { path: created.path }));
      this.selectedId = created.templateId;
      await this.reload(false);
    } catch (err) {
      new Notice(errorMessage(err));
    }
  }
}
