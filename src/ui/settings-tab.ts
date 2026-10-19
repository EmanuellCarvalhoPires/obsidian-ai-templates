// Settings tab (imperative, Obsidian-standard) for the AI Templates plugin.
import { Notice, PluginSettingTab, Setting, setIcon } from "obsidian";
import type { App, Plugin } from "obsidian";
import type { ConnectorStatus } from "../ecosystem/connector";
import { installEcosystem, isEcosystemInstalled } from "../ecosystem/dependency-modal";
import { t } from "../i18n";
import { normalizeTemplatesFolder } from "../settings/settings-store";
import type { LoadResult } from "../templates/template-loader";
import {
  DEFAULT_SETTINGS,
  MAX_BASE64_LIMIT_MB,
  MIN_BASE64_LIMIT_MB,
} from "../types/template-types";
import type { AITemplatesSettings, CollisionRule } from "../types/template-types";

export interface SettingsHost {
  settings: AITemplatesSettings;
  saveSettings(): Promise<void>;
  getConnectorStatus(): { status: ConnectorStatus; detail?: string };
  getLoadResult(): LoadResult | undefined;
  reloadTemplates(): Promise<LoadResult>;
  openTemplateManager(): void;
  openNote(path: string): Promise<void>;
}

function statusMeta(status: ConnectorStatus, detail?: string): { icon: string; state: string; title: string; desc: string } {
  switch (status) {
    case "connected":
      return {
        icon: "check-circle-2",
        state: "connected",
        title: t("settings.ecosystem.connected"),
        desc: t("settings.ecosystem.connectedDesc"),
      };
    case "waiting":
      return {
        icon: "clock",
        state: "waiting",
        title: t("settings.ecosystem.waiting"),
        desc: t("settings.ecosystem.waitingDesc"),
      };
    case "disconnected":
      return {
        icon: "plug-zap",
        state: "waiting",
        title: t("settings.ecosystem.disconnected"),
        desc: t("settings.ecosystem.disconnectedDesc"),
      };
    case "incompatible":
      return {
        icon: "x-circle",
        state: "error",
        title: t("settings.ecosystem.incompatible"),
        desc: t("settings.ecosystem.incompatibleDesc", { reason: detail ?? "" }),
      };
    case "missing":
      return {
        icon: "alert-triangle",
        state: "error",
        title: t("settings.ecosystem.missing"),
        desc: t("settings.ecosystem.missingDesc"),
      };
  }
}

export class AITemplatesSettingTab extends PluginSettingTab {
  private newFolderInput = "";

  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
    this.icon = "file-spreadsheet";
  }

  refresh(): void {
    try {
      if (this.containerEl && this.containerEl.isShown()) {
        this.display();
      }
    } catch (err) {
      console.debug("[AI Templates] Could not refresh the settings tab", err);
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderEcosystemGroup(containerEl);
    this.renderGeneralGroup(containerEl);
    this.renderFoldersGroup(containerEl);
    this.renderLoadedTemplatesGroup(containerEl);
  }

  private renderEcosystemGroup(containerEl: HTMLElement): void {
    new Setting(containerEl).setHeading().setName(t("settings.ecosystem.heading"));

    // Ecosystem Status
    const statusSetting = new Setting(containerEl);
    const { status, detail } = this.host.getConnectorStatus();
    const meta = statusMeta(status, detail);
    statusSetting.setName(meta.title).setDesc(meta.desc);
    const iconEl = createSpan({ cls: `ait-status-icon ait-status-${meta.state}` });
    setIcon(iconEl, meta.icon);
    statusSetting.nameEl.prepend(iconEl);

    if (status === "missing") {
      const installed = isEcosystemInstalled(this.app);
      statusSetting.addButton((btn) =>
        btn
          .setButtonText(installed ? t("settings.ecosystem.enable") : t("settings.ecosystem.install"))
          .setIcon("download")
          .setCta()
          .onClick(() => {
            btn.setDisabled(true);
            void installEcosystem(this.app)
              .then(() => {
                new Notice(t("dependency.installed"));
                this.display();
              })
              .catch(() => {
                new Notice(t("dependency.failed"));
                btn.setDisabled(false);
              });
          }),
      );
    }

    // Open Manager Button
    new Setting(containerEl)
      .setName(t("settings.ecosystem.openManager"))
      .setDesc(t("settings.ecosystem.openManagerDesc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.ecosystem.openManagerBtn"))
          .setIcon("file-spreadsheet")
          .onClick(() => this.host.openTemplateManager()),
      );
  }

  private renderGeneralGroup(containerEl: HTMLElement): void {
    const { settings } = this.host;
    new Setting(containerEl).setHeading().setName(t("settings.general.heading"));

    new Setting(containerEl)
      .setName(t("settings.general.folder"))
      .setDesc(t("settings.general.folderDesc"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.general.folderPlaceholder"))
          .setValue(settings.templatesFolder)
          .onChange(async (v) => {
            settings.templatesFolder = normalizeTemplatesFolder(v);
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.general.collision"))
      .setDesc(t("settings.general.collisionDesc"))
      .addDropdown((drop) => {
        drop
          .addOption("incremental", t("settings.general.collision.incremental"))
          .addOption("overwrite", t("settings.general.collision.overwrite"))
          .addOption("error", t("settings.general.collision.error"))
          .setValue(settings.defaultCollisionRule)
          .onChange(async (val) => {
            settings.defaultCollisionRule = val as CollisionRule;
            await this.host.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.general.classicLinks"))
      .setDesc(t("settings.general.classicLinksDesc"))
      .addToggle((toggle) => {
        toggle.setValue(settings.classicMarkdownLinks).onChange(async (val) => {
          settings.classicMarkdownLinks = val;
          await this.host.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.general.base64Limit"))
      .setDesc(t("settings.general.base64LimitDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = String(MIN_BASE64_LIMIT_MB);
        text.inputEl.max = String(MAX_BASE64_LIMIT_MB);
        text.inputEl.step = "0.1";
        text.setValue(String(settings.base64LimitMb));
        text.onChange(async (val) => {
          const num = parseFloat(val);
          if (Number.isFinite(num) && num >= MIN_BASE64_LIMIT_MB && num <= MAX_BASE64_LIMIT_MB) {
            text.inputEl.removeClass("has-error");
            settings.base64LimitMb = num;
            await this.host.saveSettings();
          } else {
            text.inputEl.addClass("has-error");
          }
        });
      });
  }

  private renderFoldersGroup(containerEl: HTMLElement): void {
    const { settings } = this.host;
    const groupSetting = new Setting(containerEl).setHeading().setName(t("settings.folders.heading"));
    groupSetting.setDesc(t("settings.folders.desc"));

    if (settings.allowedImageFolders.length === 0) {
      containerEl.createDiv({ cls: "ait-empty-state", text: t("settings.folders.empty") });
    } else {
      settings.allowedImageFolders.forEach((folder, idx) => {
        const item = new Setting(containerEl).setName(folder);
        item.nameEl.addClass("ait-mono");
        item.addExtraButton((btn) =>
          btn
            .setIcon("trash-2")
            .setTooltip(t("settings.folders.remove"))
            .onClick(async () => {
              settings.allowedImageFolders = settings.allowedImageFolders.filter((_, i) => i !== idx);
              await this.host.saveSettings();
              this.display();
            }),
        );
      });
    }

    new Setting(containerEl)
      .setName(t("settings.folders.add"))
      .addText((text) => {
        text
          .setPlaceholder(t("settings.folders.addPlaceholder"))
          .setValue(this.newFolderInput)
          .onChange((v) => {
            this.newFolderInput = v;
          });
      })
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.folders.add"))
          .setIcon("plus")
          .onClick(async () => {
            const value = this.newFolderInput.trim();
            if (value === "") {
              new Notice(t("settings.folders.invalid"));
              return;
            }
            if (settings.allowedImageFolders.includes(value)) {
              new Notice(t("settings.folders.duplicate"));
              return;
            }
            settings.allowedImageFolders = [...settings.allowedImageFolders, value];
            this.newFolderInput = "";
            await this.host.saveSettings();
            this.display();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.folders.reset"))
      .setDesc(t("settings.folders.resetDesc"))
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.folders.reset"))
          .setIcon("rotate-ccw")
          .onClick(async () => {
            settings.allowedImageFolders = [...DEFAULT_SETTINGS.allowedImageFolders];
            await this.host.saveSettings();
            this.display();
          }),
      );
  }

  private renderLoadedTemplatesGroup(containerEl: HTMLElement): void {
    new Setting(containerEl).setHeading().setName(t("settings.status.heading"));

    const loaded = this.host.getLoadResult();
    const count = loaded?.templates.length ?? 0;
    const problems = loaded?.problems ?? [];

    new Setting(containerEl)
      .setName(t("settings.status.summary", { count, folder: this.host.settings.templatesFolder }))
      .setDesc(
        problems.length === 0
          ? t("settings.status.noProblems")
          : t("settings.status.problemsCount", { count: problems.length }),
      )
      .addButton((btn) =>
        btn
          .setButtonText(t("settings.status.reload"))
          .setIcon("refresh-cw")
          .onClick(async () => {
            await this.host.reloadTemplates();
            this.display();
          }),
      );

    for (const tpl of loaded?.templates ?? []) {
      const setting = new Setting(containerEl)
        .setName(tpl.id)
        .setDesc(`${tpl.description} (${tpl.sourcePath})`);
      setting.nameEl.addClass("ait-mono");
      setting.addExtraButton((btn) =>
        btn
          .setIcon("file-text")
          .setTooltip(t("modal.openNote"))
          .onClick(() => void this.host.openNote(tpl.sourcePath)),
      );
    }

    for (const problem of problems) {
      const label = problem.level === "error" ? t("settings.status.levelError") : t("settings.status.levelWarning");
      const setting = new Setting(containerEl)
        .setName(`${label}: ${problem.path}`)
        .setDesc(problem.message);
      const iconSpan = createSpan({
        cls: `ait-status-icon ${problem.level === "error" ? "ait-status-error" : "ait-status-waiting"}`,
      });
      setIcon(iconSpan, problem.level === "error" ? "x-circle" : "alert-triangle");
      setting.nameEl.prepend(iconSpan);
    }
  }
}
