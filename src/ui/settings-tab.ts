// Settings tab (declarative, Obsidian 1.13+) for the AI Templates plugin.
import { Notice, PluginSettingTab, setIcon } from "obsidian";
import type { App, Plugin, Setting, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type { ConnectorStatus } from "../ecosystem/connector";
import { installEcosystem, isEcosystemInstalled } from "../ecosystem/dependency-modal";
import { t } from "../i18n";
import { normalizeSettings, normalizeTemplatesFolder } from "../settings/settings-store";
import type { LoadResult } from "../templates/template-loader";
import {
  DEFAULT_SETTINGS,
  MAX_BASE64_LIMIT_MB,
  MIN_BASE64_LIMIT_MB,
} from "../types/template-types";
import type { AITemplatesSettings } from "../types/template-types";

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
      this.update();
    } catch (err) {
      console.debug("[AI Templates] Could not refresh the settings tab", err);
    }
  }

  getControlValue(key: string): unknown {
    const { settings } = this.host;
    switch (key) {
      case "templatesFolder":
        return settings.templatesFolder;
      case "defaultCollisionRule":
        return settings.defaultCollisionRule;
      case "classicMarkdownLinks":
        return settings.classicMarkdownLinks;
      case "base64LimitMb":
        return settings.base64LimitMb;
      default:
        return undefined;
    }
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const { settings } = this.host;
    switch (key) {
      case "templatesFolder":
        settings.templatesFolder = normalizeTemplatesFolder(value);
        break;
      case "defaultCollisionRule":
        settings.defaultCollisionRule = normalizeSettings({ ...settings, defaultCollisionRule: value }).defaultCollisionRule;
        break;
      case "classicMarkdownLinks":
        settings.classicMarkdownLinks = Boolean(value);
        break;
      case "base64LimitMb":
        settings.base64LimitMb = normalizeSettings({ ...settings, base64LimitMb: value }).base64LimitMb;
        break;
      default:
        return;
    }
    await this.host.saveSettings();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      this.ecosystemGroup(),
      this.generalGroup(),
      this.foldersGroup(),
      this.loadedTemplatesGroup(),
    ];
  }

  private ecosystemGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: t("settings.ecosystem.heading"),
      items: [
        {
          name: t("settings.ecosystem.heading"),
          searchable: false,
          render: (setting: Setting) => {
            const { status, detail } = this.host.getConnectorStatus();
            const meta = statusMeta(status, detail);
            setting.setName(meta.title).setDesc(meta.desc);
            const iconEl = createSpan({ cls: `ait-status-icon ait-status-${meta.state}` });
            setIcon(iconEl, meta.icon);
            setting.nameEl.prepend(iconEl);

            if (status === "missing") {
              const installed = isEcosystemInstalled(this.app);
              setting.addButton((btn) =>
                btn
                  .setButtonText(installed ? t("settings.ecosystem.enable") : t("settings.ecosystem.install"))
                  .setIcon("download")
                  .setCta()
                  .onClick(() => {
                    btn.setDisabled(true);
                    void installEcosystem(this.app)
                      .then(() => {
                        new Notice(t("dependency.installed"));
                        this.refresh();
                      })
                      .catch(() => {
                        new Notice(t("dependency.failed"));
                        btn.setDisabled(false);
                      });
                  }),
              );
            }
          },
        },
        {
          name: t("settings.ecosystem.openManager"),
          desc: t("settings.ecosystem.openManagerDesc"),
          render: (setting: Setting) => {
            setting.addButton((btn) =>
              btn
                .setButtonText(t("settings.ecosystem.openManagerBtn"))
                .setIcon("file-spreadsheet")
                .onClick(() => this.host.openTemplateManager()),
            );
          },
        },
      ],
    };
  }

  private generalGroup(): SettingDefinitionItem {
    const { settings } = this.host;
    return {
      type: "group",
      heading: t("settings.general.heading"),
      items: [
        {
          name: t("settings.general.folder"),
          desc: t("settings.general.folderDesc"),
          control: {
            type: "text",
            key: "templatesFolder",
            placeholder: t("settings.general.folderPlaceholder"),
          },
        },
        {
          name: t("settings.general.collision"),
          desc: t("settings.general.collisionDesc"),
          control: {
            type: "dropdown",
            key: "defaultCollisionRule",
            options: {
              incremental: t("settings.general.collision.incremental"),
              overwrite: t("settings.general.collision.overwrite"),
              error: t("settings.general.collision.error"),
            },
          },
        },
        {
          name: t("settings.general.classicLinks"),
          desc: t("settings.general.classicLinksDesc"),
          control: {
            type: "toggle",
            key: "classicMarkdownLinks",
          },
        },
        {
          name: t("settings.general.base64Limit"),
          desc: t("settings.general.base64LimitDesc"),
          control: {
            type: "number",
            key: "base64LimitMb",
            min: MIN_BASE64_LIMIT_MB,
            max: MAX_BASE64_LIMIT_MB,
            step: 0.1,
            defaultValue: settings.base64LimitMb,
          },
        },
      ],
    };
  }

  private foldersGroup(): SettingDefinitionItem {
    const { settings } = this.host;
    const folderItems: SettingGroupItem[] = settings.allowedImageFolders.map((folder, idx) => ({
      name: folder,
      searchable: false,
      render: (setting: Setting) => {
        setting.setName(folder);
        setting.nameEl.addClass("ait-mono");
        setting.addExtraButton((btn) =>
          btn
            .setIcon("trash-2")
            .setTooltip(t("settings.folders.remove"))
            .onClick(() => {
              settings.allowedImageFolders = settings.allowedImageFolders.filter((_, i) => i !== idx);
              void this.host.saveSettings().then(() => this.refresh());
            }),
        );
      },
    }));

    return {
      type: "group",
      heading: t("settings.folders.heading"),
      desc: t("settings.folders.desc"),
      items: [
        ...(folderItems.length > 0
          ? folderItems
          : [
              {
                name: t("settings.folders.empty"),
                searchable: false,
              } satisfies SettingGroupItem,
            ]),
        {
          name: t("settings.folders.add"),
          searchable: false,
          render: (setting: Setting) => {
            setting.addText((text) => {
              text
                .setPlaceholder(t("settings.folders.addPlaceholder"))
                .setValue(this.newFolderInput)
                .onChange((v) => {
                  this.newFolderInput = v;
                });
            });
            setting.addButton((btn) =>
              btn
                .setButtonText(t("settings.folders.add"))
                .setIcon("plus")
                .onClick(() => {
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
                  void this.host.saveSettings().then(() => this.refresh());
                }),
            );
          },
        },
        {
          name: t("settings.folders.reset"),
          desc: t("settings.folders.resetDesc"),
          searchable: false,
          render: (setting: Setting) => {
            setting.addButton((btn) =>
              btn
                .setButtonText(t("settings.folders.reset"))
                .setIcon("rotate-ccw")
                .onClick(() => {
                  settings.allowedImageFolders = [...DEFAULT_SETTINGS.allowedImageFolders];
                  void this.host.saveSettings().then(() => this.refresh());
                }),
            );
          },
        },
      ],
    };
  }

  private loadedTemplatesGroup(): SettingDefinitionItem {
    const loaded = this.host.getLoadResult();
    const count = loaded?.templates.length ?? 0;
    const problems = loaded?.problems ?? [];

    const templateItems: SettingGroupItem[] = (loaded?.templates ?? []).map((tpl) => ({
      name: tpl.id,
      desc: `${tpl.description} (${tpl.sourcePath})`,
      searchable: false,
      render: (setting: Setting) => {
        setting.setName(tpl.id).setDesc(`${tpl.description} (${tpl.sourcePath})`);
        setting.nameEl.addClass("ait-mono");
        setting.addExtraButton((btn) =>
          btn
            .setIcon("file-text")
            .setTooltip(t("modal.openNote"))
            .onClick(() => void this.host.openNote(tpl.sourcePath)),
        );
      },
    }));

    const problemItems: SettingGroupItem[] = problems.map((problem) => ({
      name: problem.path,
      desc: problem.message,
      searchable: false,
      render: (setting: Setting) => {
        const label = problem.level === "error" ? t("settings.status.levelError") : t("settings.status.levelWarning");
        setting.setName(`${label}: ${problem.path}`).setDesc(problem.message);
        const iconSpan = createSpan({
          cls: `ait-status-icon ${problem.level === "error" ? "ait-status-error" : "ait-status-waiting"}`,
        });
        setIcon(iconSpan, problem.level === "error" ? "x-circle" : "alert-triangle");
        setting.nameEl.prepend(iconSpan);
      },
    }));

    return {
      type: "group",
      heading: t("settings.status.heading"),
      items: [
        {
          name: t("settings.status.summary", { count, folder: this.host.settings.templatesFolder }),
          desc:
            problems.length === 0
              ? t("settings.status.noProblems")
              : t("settings.status.problemsCount", { count: problems.length }),
          searchable: false,
          render: (setting: Setting) => {
            setting.addButton((btn) =>
              btn
                .setButtonText(t("settings.status.reload"))
                .setIcon("refresh-cw")
                .onClick(() => {
                  void this.host.reloadTemplates().then(() => this.refresh());
                }),
            );
          },
        },
        ...templateItems,
        ...problemItems,
      ],
    };
  }
}
