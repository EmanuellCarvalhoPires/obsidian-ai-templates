// Entry point of the AI Templates plugin.
import { Notice, Plugin, TAbstractFile, TFile, setIcon } from "obsidian";
import { EcosystemConnector } from "./ecosystem/connector";
import type { ConnectorStatus } from "./ecosystem/connector";
import { MissingEcosystemModal } from "./ecosystem/dependency-modal";
import { AI_ECOSYSTEM_API_VERSION } from "./ecosystem/types";
import { TemplateEngine } from "./engine/template-engine";
import { t } from "./i18n";
import { normalizeSettings } from "./settings/settings-store";
import { AttachmentService } from "./storage/attachment-service";
import { createNodeFs } from "./storage/node-fs";
import { NoteCreator } from "./storage/note-creator";
import { ObsidianVaultPort } from "./storage/obsidian-vault";
import { TemplateCreator } from "./templates/template-creator";
import { TemplateLoader } from "./templates/template-loader";
import type { LoadResult } from "./templates/template-loader";
import { TemplateService } from "./templates/template-service";
import { MODULE_ID, MODULE_INSTRUCTIONS, buildRoutes, buildTools } from "./tools/templates-module";
import type { AITemplatesSettings } from "./types/template-types";
import { AITemplatesSettingTab } from "./ui/settings-tab";
import type { SettingsHost } from "./ui/settings-tab";
import { TemplateManagerModal } from "./ui/template-modal";

function isMarkdownFile(file: TAbstractFile): file is TFile {
  return file instanceof TFile && file.extension === "md";
}

export default class AITemplatesPlugin extends Plugin implements SettingsHost {
  settings: AITemplatesSettings = normalizeSettings(undefined);

  private vaultPort!: ObsidianVaultPort;
  private engine!: TemplateEngine;
  private loader!: TemplateLoader;
  private attachments!: AttachmentService;
  private noteCreator!: NoteCreator;
  private creator!: TemplateCreator;
  private service!: TemplateService;
  private connector!: EcosystemConnector;

  private settingTab: AITemplatesSettingTab | undefined;
  private statusBarEl: HTMLElement | undefined;
  private statusIconEl: HTMLElement | undefined;
  private statusTextEl: HTMLElement | undefined;
  private unsubscribeLoader: (() => void) | undefined;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());

    this.vaultPort = new ObsidianVaultPort(this.app);
    const fs = createNodeFs();

    this.engine = new TemplateEngine({
      classicMarkdownLinks: () => this.settings.classicMarkdownLinks,
    });

    this.loader = new TemplateLoader({
      vault: this.vaultPort,
      engine: this.engine,
      getFolder: () => this.settings.templatesFolder,
    });

    this.noteCreator = new NoteCreator(this.vaultPort);

    this.attachments = new AttachmentService({
      vault: this.vaultPort,
      fs,
      getAllowedFolders: () => this.settings.allowedImageFolders,
      getBase64LimitMb: () => this.settings.base64LimitMb,
      ensureFolder: (dir) => this.noteCreator.ensureFolder(dir),
    });

    this.creator = new TemplateCreator({
      vault: this.vaultPort,
      engine: this.engine,
      loader: this.loader,
      notes: this.noteCreator,
      getFolder: () => this.settings.templatesFolder,
    });

    this.service = new TemplateService({
      vault: this.vaultPort,
      engine: this.engine,
      loader: this.loader,
      attachments: this.attachments,
      notes: this.noteCreator,
      creator: this.creator,
      getSettings: () => this.settings,
      logActivity: (entry) => {
        const api = this.connector?.getApi();
        if (!api) return;
        api.logActivity({
          moduleId: MODULE_ID,
          type: entry.type,
          target: entry.target,
          status: entry.status,
          durationMs: entry.durationMs,
          payload: entry.payload,
        });
      },
    });

    this.unsubscribeLoader = this.loader.onLoaded(() => {
      this.updateStatusBar();
      this.settingTab?.refresh();
    });

    this.setupStatusBar();

    this.connector = new EcosystemConnector(this, {
      buildRegistration: () => ({
        id: MODULE_ID,
        name: this.manifest.name,
        version: this.manifest.version,
        apiVersion: AI_ECOSYSTEM_API_VERSION,
        tools: buildTools(this.service, this.loader),
        routes: buildRoutes(this.service, this.loader),
        instructions: MODULE_INSTRUCTIONS,
      }),
      onStatus: () => {
        this.updateStatusBar();
        this.settingTab?.refresh();
      },
      onMissing: () => new MissingEcosystemModal(this.app).open(),
      onIncompatible: (reason) => new Notice(reason),
      onConnected: (api) => {
        api.registerService("templates", MODULE_ID, this.service);
      },
    });
    this.connector.start();

    this.registerVaultWatchers();

    this.addRibbonIcon("file-spreadsheet", t("core.ribbon.manager"), () => this.openTemplateManager());

    this.addCommand({
      id: "open-template-manager",
      name: t("core.cmd.openManager"),
      callback: () => this.openTemplateManager(),
    });

    this.addCommand({
      id: "reload-templates",
      name: t("core.cmd.reload"),
      callback: () => {
        void this.reloadTemplates().then((res) => {
          const count = res.templates.length;
          const problems = res.problems.length;
          new Notice(
            problems > 0
              ? t("core.notice.reloadedProblems", { count, problems })
              : t("core.notice.reloaded", { count }),
          );
        });
      },
    });

    this.settingTab = new AITemplatesSettingTab(this.app, this, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(() => {
      void this.loader.load();
    });
  }

  onunload(): void {
    this.unsubscribeLoader?.();
    this.connector?.stop();
  }

  // ---- SettingsHost ---------------------------------------------------------

  async saveSettings(): Promise<void> {
    try {
      await this.saveData(this.settings);
      this.loader.invalidate();
      void this.loader.load();
    } catch (err) {
      console.error("[AI Templates] Could not save settings", err);
      new Notice(t("core.notice.saveFailed"));
    }
  }

  getConnectorStatus(): { status: ConnectorStatus; detail?: string } {
    return {
      status: this.connector.status,
      detail: this.connector.statusDetail,
    };
  }

  getLoadResult(): LoadResult | undefined {
    return this.loader.lastResult();
  }

  async reloadTemplates(): Promise<LoadResult> {
    this.loader.invalidate();
    return this.loader.load();
  }

  openTemplateManager(): void {
    new TemplateManagerModal(this.app, {
      loader: this.loader,
      service: this.service,
      getSettings: () => this.settings,
      openNote: (path) => this.openNote(path),
    }).open();
  }

  async openNote(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  // ---- Internals ------------------------------------------------------------

  private registerVaultWatchers(): void {
    const invalidateIfMarkdown = (file: TAbstractFile, oldPath?: string): void => {
      if (isMarkdownFile(file) || (typeof oldPath === "string" && oldPath.endsWith(".md"))) {
        this.loader.invalidate();
      }
    };

    this.registerEvent(this.app.vault.on("create", (file) => invalidateIfMarkdown(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => invalidateIfMarkdown(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => invalidateIfMarkdown(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => invalidateIfMarkdown(file, oldPath)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => invalidateIfMarkdown(file)));
  }

  private setupStatusBar(): void {
    const el = this.addStatusBarItem();
    el.addClass("ait-status-bar", "mod-clickable");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", t("core.status.aria"));
    this.statusIconEl = el.createSpan({ cls: "ait-status-bar-icon" });
    this.statusTextEl = el.createSpan({ cls: "ait-status-bar-text" });

    const activate = (): void => this.openTemplateManager();
    el.addEventListener("click", activate);
    el.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        activate();
      }
    });
    this.statusBarEl = el;
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    if (!this.statusBarEl || !this.statusIconEl || !this.statusTextEl) return;
    const status = this.connector?.status ?? "missing";
    const count = this.loader?.lastResult()?.templates.length ?? 0;

    this.statusBarEl.removeClass("ait-state-connected", "ait-state-waiting", "ait-state-error");

    switch (status) {
      case "connected":
        this.statusBarEl.addClass("ait-state-connected");
        setIcon(this.statusIconEl, "file-spreadsheet");
        this.statusTextEl.setText(t("core.status.connected", { count }));
        break;
      case "waiting":
        this.statusBarEl.addClass("ait-state-waiting");
        setIcon(this.statusIconEl, "clock");
        this.statusTextEl.setText(t("core.status.waiting"));
        break;
      case "disconnected":
        this.statusBarEl.addClass("ait-state-waiting");
        setIcon(this.statusIconEl, "plug-zap");
        this.statusTextEl.setText(t("core.status.disconnected"));
        break;
      case "incompatible":
        this.statusBarEl.addClass("ait-state-error");
        setIcon(this.statusIconEl, "x-circle");
        this.statusTextEl.setText(t("core.status.incompatible"));
        break;
      case "missing":
        this.statusBarEl.addClass("ait-state-error");
        setIcon(this.statusIconEl, "alert-triangle");
        this.statusTextEl.setText(t("core.status.missing"));
        break;
    }
  }
}
