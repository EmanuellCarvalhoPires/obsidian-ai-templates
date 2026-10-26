// Entry point of the AI Templates plugin.
import { Notice, Plugin, TAbstractFile, normalizePath, setIcon } from "obsidian";
import { EcosystemConnector } from "./ecosystem/connector";
import type { ConnectorStatus } from "./ecosystem/connector";
import { MissingEcosystemModal } from "./ecosystem/dependency-modal";
import { createSetupHandler, publishRuleData, registerSetupHandler } from "./ecosystem/hooks-integration";
import { AI_ECOSYSTEM_API_VERSION, SECRETS_SERVICE, toolRunnerServiceName } from "./ecosystem/types";
import type { AIEcosystemAPI, SecretVaultService } from "./ecosystem/types";
import { TemplateEngine } from "./engine/template-engine";
import { currentLanguage, t } from "./i18n";
import { normalizeSettings } from "./settings/settings-store";
import { installStarterPack } from "./starter/starter-pack";
import { AttachmentService } from "./storage/attachment-service";
import { createNodeFs } from "./storage/node-fs";
import { NoteCreator } from "./storage/note-creator";
import { ObsidianVaultPort } from "./storage/obsidian-vault";
import { TemplateCreator } from "./templates/template-creator";
import { TemplateLoader } from "./templates/template-loader";
import type { LoadResult } from "./templates/template-loader";
import { TemplateService } from "./templates/template-service";
import { MODULE_ID, MODULE_INSTRUCTIONS, buildRoutes, buildTools } from "./tools/templates-module";
import { TemplateToolRunner, buildTemplateIndexEntries } from "./tools/template-index";
import type { AITemplatesSettings, TemplateDefinition } from "./types/template-types";
import { AITemplatesSettingTab } from "./ui/settings-tab";
import type { SettingsHost } from "./ui/settings-tab";
import { TemplateManagerModal } from "./ui/template-modal";

/** Quiet time after the last change in the templates folder before the templates are read again. */
const RELOAD_DELAY_MS = 500;

export default class AITemplatesPlugin extends Plugin implements SettingsHost {
  settings: AITemplatesSettings = normalizeSettings(undefined);

  private vaultPort!: ObsidianVaultPort;
  private engine!: TemplateEngine;
  private loader!: TemplateLoader;
  private attachments!: AttachmentService;
  private noteCreator!: NoteCreator;
  private creator!: TemplateCreator;
  private service!: TemplateService;
  private toolRunner!: TemplateToolRunner;
  private connector!: EcosystemConnector;

  private settingTab: AITemplatesSettingTab | undefined;
  private statusBarEl: HTMLElement | undefined;
  private statusIconEl: HTMLElement | undefined;
  private statusTextEl: HTMLElement | undefined;
  private unsubscribeLoader: (() => void) | undefined;
  private unregisterSetupHandler: (() => void) | undefined;
  private reloadTimer: number | undefined;

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
      getSecrets: () => this.getSecretsService(),
      logActivity: (entry) => {
        const api = this.connector?.getApi();
        if (!api) return;
        api.logActivity({
          moduleId: MODULE_ID,
          client: entry.client,
          type: entry.type,
          target: entry.target,
          status: entry.status,
          durationMs: entry.durationMs,
          payload: entry.payload,
          response: entry.response,
          output: entry.output,
        });
      },
    });

    this.toolRunner = new TemplateToolRunner(this.service, this.redactor);

    this.unsubscribeLoader = this.loader.onLoaded((res) => {
      this.updateStatusBar();
      this.settingTab?.refresh();
      const api = this.connector?.getApi();
      if (api) {
        publishRuleData(api, res.templates);
        this.syncToolIndex(api, res.templates);
        api.logActivity({
          moduleId: MODULE_ID,
          client: "Obsidian UI",
          type: "templates-reloaded",
          target: `${res.templates.length} templates`,
          status: 200,
          durationMs: 0,
          response: {
            count: res.templates.length,
            problems: res.problems.length,
          },
        });
      }
    });

    this.setupStatusBar();

    this.connector = new EcosystemConnector(this, {
      buildRegistration: () => ({
        id: MODULE_ID,
        name: this.manifest.name,
        version: this.manifest.version,
        apiVersion: AI_ECOSYSTEM_API_VERSION,
        tools: buildTools(this.service, this.loader, this.redactor),
        routes: buildRoutes(this.service, this.loader, this.redactor),
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
        api.registerService(toolRunnerServiceName(MODULE_ID), MODULE_ID, this.toolRunner);
        publishRuleData(api, this.loader.lastResult()?.templates ?? []);
        void this.loader.load().then((res) => this.syncToolIndex(api, res.templates));
        this.unregisterSetupHandler?.();
        this.unregisterSetupHandler = registerSetupHandler(
          api,
          createSetupHandler({
            getSettings: () => this.settings,
            saveSettings: () => this.saveSettings(),
            getTemplateCount: () => this.loader.lastResult()?.templates.length ?? 0,
            folderExists: (path) => this.vaultPort.kind(path) === "folder",
          }),
        );
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

    this.addCommand({
      id: "reinstall-starter-templates",
      name: t("core.cmd.reinstallStarter"),
      callback: () => void this.reinstallStarterTemplates(),
    });

    this.settingTab = new AITemplatesSettingTab(this.app, this, this);
    this.addSettingTab(this.settingTab);

    this.app.workspace.onLayoutReady(() => {
      // The starter templates go in first, so the first load already lists them.
      void this.installStarterTemplates(false).finally(() => void this.loader.load());
    });
  }

  onunload(): void {
    if (this.reloadTimer !== undefined) window.clearTimeout(this.reloadTimer);
    this.unsubscribeLoader?.();
    this.unregisterSetupHandler?.();
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

  async reinstallStarterTemplates(): Promise<void> {
    await this.installStarterTemplates(true);
  }

  async openNote(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  // ---- Internals ------------------------------------------------------------

  /**
   * Installs the starter templates that are missing. `restore` ignores the install history (the
   * reinstall command and button); otherwise it follows the setting and skips deleted templates.
   */
  private async installStarterTemplates(restore: boolean): Promise<void> {
    if (!restore && !this.settings.installStarterPack) return;
    try {
      const folder = this.settings.templatesFolder;
      const installed = await installStarterPack({
        vault: this.vaultPort,
        folder,
        installedIds: restore ? [] : this.settings.starterPackInstalledIds,
        locale: currentLanguage(),
      });
      if (installed.length > 0) {
        this.settings.starterPackInstalledIds = Array.from(
          new Set([...this.settings.starterPackInstalledIds, ...installed]),
        );
        await this.saveSettings();
        new Notice(t("core.notice.starterPackInstalled", { count: installed.length, folder }));
      } else if (restore) {
        new Notice(t("core.notice.starterPackNothing", { folder }));
      }
    } catch (err) {
      console.error("[AI Templates] Could not install the starter templates", err);
      new Notice(t("core.notice.starterPackFailed"));
    }
  }

  private getSecretsService(): SecretVaultService | undefined {
    try {
      return this.connector?.getApi()?.getService<SecretVaultService>(SECRETS_SERVICE);
    } catch {
      return undefined;
    }
  }

  /** Output filter of Environment Keys: masks secret values in everything returned to agents. */
  private readonly redactor = (text: string): string => {
    const secrets = this.getSecretsService();
    return secrets && typeof secrets.redact === "function" ? secrets.redact(text) : text;
  };

  /** Keeps the templates, the hook rule data and tools.db in step with the templates folder. */
  private registerVaultWatchers(): void {
    // Only changes inside the templates folder matter; anything else in the vault is ignored.
    const onChange = (file: TAbstractFile, oldPath?: string): void => {
      if (this.isInTemplatesFolder(file.path) || (oldPath !== undefined && this.isInTemplatesFolder(oldPath))) {
        this.scheduleReload();
      }
    };

    this.registerEvent(this.app.vault.on("create", (file) => onChange(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => onChange(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => onChange(file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => onChange(file, oldPath)));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => onChange(file)));
  }

  private isInTemplatesFolder(path: string): boolean {
    const folder = normalizePath(this.settings.templatesFolder.trim()).replace(/^\/+|\/+$/g, "");
    return folder === "" || path === folder || path.startsWith(`${folder}/`);
  }

  /** Reloads the templates shortly after the last change, so a burst of edits is one reload. */
  private scheduleReload(): void {
    if (this.reloadTimer !== undefined) window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = undefined;
      this.loader.invalidate();
      void this.loader.load();
    }, RELOAD_DELAY_MS);
  }

  /** Writes the moldes into this module's tools.db (kind "template"), when the AI Ecosystem has the index. */
  private syncToolIndex(api: AIEcosystemAPI, templates: readonly TemplateDefinition[]): void {
    if (!api.toolIndex) return;
    const entries = buildTemplateIndexEntries(templates, this.settings.defaultCollisionRule);
    api.toolIndex.sync(MODULE_ID, entries).catch((err: unknown) => {
      console.error("[AI Templates] Could not sync the tool index", err);
    });
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
