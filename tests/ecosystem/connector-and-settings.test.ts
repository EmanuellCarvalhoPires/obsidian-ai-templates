import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, Plugin } from "obsidian";
import { Events, requestUrlMock, setMockLanguage } from "../mocks/obsidian";
import { EcosystemConnector, type ConnectorStatus } from "../../src/ecosystem/connector";
import {
  ECOSYSTEM_REPO,
  MissingEcosystemModal,
  installEcosystem,
  isEcosystemInstalled,
} from "../../src/ecosystem/dependency-modal";
import {
  AI_ECOSYSTEM_API_VERSION,
  ECOSYSTEM_EVENTS,
  ECOSYSTEM_ID,
  type AIEcosystemAPI,
  type HubModuleRegistration,
  type RegisterResult,
} from "../../src/ecosystem/types";
import { allStrings, currentLanguage, setLanguage, t } from "../../src/i18n";
import { normalizeSettings, normalizeTemplatesFolder } from "../../src/settings/settings-store";
import {
  DEFAULT_SETTINGS,
  MAX_BASE64_LIMIT_MB,
  MIN_BASE64_LIMIT_MB,
} from "../../src/types/template-types";

describe("i18n, settings-store, EcosystemConnector, and dependency-modal", () => {
  afterEach(() => {
    setLanguage(undefined);
    setMockLanguage("en");
  });

  describe("i18n", () => {
    it("has 100% key parity between en and pt and no empty strings", () => {
      const table = allStrings();
      const enKeys = Object.keys(table.en).sort();
      const ptKeys = Object.keys(table.pt).sort();
      expect(enKeys).toEqual(ptKeys);
      for (const k of enKeys) {
        expect(table.en[k]?.trim().length).toBeGreaterThan(0);
        expect(table.pt[k]?.trim().length).toBeGreaterThan(0);
      }
    });

    it("contains no emojis in any UI string (en and pt)", () => {
      const emojiPattern = /\p{Extended_Pictographic}/u;
      const table = allStrings();
      for (const [key, val] of Object.entries(table.en)) {
        expect(emojiPattern.test(val), `en["${key}"] should not contain emoji`).toBe(false);
      }
      for (const [key, val] of Object.entries(table.pt)) {
        expect(emojiPattern.test(val), `pt["${key}"] should not contain emoji`).toBe(false);
      }
    });

    it("switches language via setLanguage and replaces {name} placeholders in t()", () => {
      setLanguage("en");
      expect(currentLanguage()).toBe("en");
      expect(t("core.notice.reloadedProblems", { count: 4, problems: 1 })).toBe(
        "Reloaded 4 template(s) (1 problem(s)).",
      );

      setLanguage("pt");
      expect(currentLanguage()).toBe("pt");
      expect(t("core.notice.reloadedProblems", { count: 4, problems: 1 })).toBe(
        "4 template(s) recarregado(s) (1 problema(s)).",
      );

      // Falls back to Obsidian's getLanguage() when setLanguage(undefined)
      setLanguage(undefined);
      setMockLanguage("pt-BR");
      expect(currentLanguage()).toBe("pt");
      setMockLanguage("en");
      expect(currentLanguage()).toBe("en");

      // Missing key returns the key itself
      expect(t("nonexistent.key")).toBe("nonexistent.key");
    });
  });

  describe("settings-store", () => {
    it("normalizes templatesFolder and rejects '..', '.obsidian'/hidden folders, and drive letters", () => {
      expect(normalizeTemplatesFolder("  Custom\\Templates/Sub/  ")).toBe("Custom/Templates/Sub");
      expect(normalizeTemplatesFolder("")).toBe(DEFAULT_SETTINGS.templatesFolder);
      expect(normalizeTemplatesFolder(null)).toBe(DEFAULT_SETTINGS.templatesFolder);
      expect(normalizeTemplatesFolder("../Outside")).toBe(DEFAULT_SETTINGS.templatesFolder);
      expect(normalizeTemplatesFolder("Templates/../Secret")).toBe(DEFAULT_SETTINGS.templatesFolder);
      expect(normalizeTemplatesFolder(".obsidian/plugins")).toBe(DEFAULT_SETTINGS.templatesFolder);
      expect(normalizeTemplatesFolder("Templates/.hidden")).toBe(DEFAULT_SETTINGS.templatesFolder);
      expect(normalizeTemplatesFolder("C:/Templates")).toBe(DEFAULT_SETTINGS.templatesFolder);
    });

    it("normalizes full settings, clamps base64LimitMb, and deduplicates allowedImageFolders", () => {
      expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
      expect(normalizeSettings("invalid")).toEqual(DEFAULT_SETTINGS);

      const low = normalizeSettings({ base64LimitMb: 0.001 });
      expect(low.base64LimitMb).toBe(MIN_BASE64_LIMIT_MB);

      const high = normalizeSettings({ base64LimitMb: 999 });
      expect(high.base64LimitMb).toBe(MAX_BASE64_LIMIT_MB);

      const custom = normalizeSettings({
        templatesFolder: "MyTemplates/AI",
        defaultCollisionRule: "overwrite",
        allowedImageFolders: [" {tmpdir} ", "{tmpdir}", "", "  ", "/custom/dir", 123],
        base64LimitMb: "5.556",
        classicMarkdownLinks: true,
      });

      expect(custom).toEqual({
        templatesFolder: "MyTemplates/AI",
        defaultCollisionRule: "overwrite",
        allowedImageFolders: ["{tmpdir}", "/custom/dir"],
        base64LimitMb: 5.56,
        classicMarkdownLinks: true,
        installStarterPack: true,
        starterPackInstalledIds: [],
      });
      expect(normalizeSettings({ installStarterPack: false, starterPackInstalledIds: ["a", " a ", "", 3, "b"] })).toMatchObject({
        installStarterPack: false,
        starterPackInstalledIds: ["a", "b"],
      });
    });
  });

  describe("EcosystemConnector", () => {
    function createFakeApi(opts: { ready?: boolean; registerResult?: RegisterResult } = {}) {
      let ready = opts.ready ?? true;
      const registerResult: RegisterResult = opts.registerResult ?? { ok: true };
      const registered: HubModuleRegistration[] = [];
      const unregistered: string[] = [];

      const api: AIEcosystemAPI & { setReady: (r: boolean) => void } = {
        apiVersion: AI_ECOSYSTEM_API_VERSION,
        isReady: () => ready,
        setReady: (r: boolean) => {
          ready = r;
        },
        registerModule: (mod) => {
          registered.push(mod);
          return registerResult;
        },
        unregisterModule: (id) => {
          unregistered.push(id);
          return true;
        },
        updateTools: () => {},
        updatePrompts: () => {},
        registerService: () => {},
        unregisterService: () => {},
        getService: () => undefined,
        onServiceChange: () => () => {},
        logActivity: () => {},
        getServerStatus: () => ({ running: true, port: 27124, activeModules: [] }),
      };

      return { api, registered, unregistered };
    }

    function createHarness(installedApi?: AIEcosystemAPI) {
      const workspaceEvents = new Events();
      let layoutReadyCb: (() => void) | undefined;
      let currentInstalledApi = installedApi;

      const app = {
        workspace: {
          onLayoutReady: (cb: () => void) => {
            layoutReadyCb = cb;
          },
          on: (name: string, cb: (...args: unknown[]) => unknown) => workspaceEvents.on(name, cb),
          trigger: (name: string, ...args: unknown[]) => workspaceEvents.trigger(name, ...args),
        },
        plugins: {
          getPlugin: (id: string) => (id === ECOSYSTEM_ID && currentInstalledApi ? { api: currentInstalledApi } : null),
        },
      };

      const plugin = {
        app,
        registerEvent: () => {},
      } as unknown as Plugin;

      return {
        plugin,
        triggerLayoutReady: () => layoutReadyCb?.(),
        triggerWorkspace: (name: string, ...args: unknown[]) => workspaceEvents.trigger(name, ...args),
        setInstalledApi: (api: AIEcosystemAPI | undefined) => {
          currentInstalledApi = api;
        },
      };
    }

    const buildRegistration = (): HubModuleRegistration => ({
      id: "ai-templates",
      name: "AI Templates",
      version: "1.0.0",
      apiVersion: AI_ECOSYSTEM_API_VERSION,
    });

    it("registers immediately onLayoutReady when AI Ecosystem is already ready and calls onConnected(api)", () => {
      const { api, registered } = createFakeApi({ ready: true });
      const { plugin, triggerLayoutReady } = createHarness(api);
      const statuses: ConnectorStatus[] = [];
      let connectedApi: AIEcosystemAPI | undefined;

      const connector = new EcosystemConnector(plugin, {
        buildRegistration,
        onStatus: (s) => statuses.push(s),
        onConnected: (a) => {
          connectedApi = a;
        },
      });

      connector.start();
      triggerLayoutReady();

      expect(connector.status).toBe("connected");
      expect(connector.isConnected()).toBe(true);
      expect(connector.getApi()).toBe(api);
      expect(connectedApi).toBe(api);
      expect(registered).toHaveLength(1);
      expect(statuses).toEqual(["connected"]);
    });

    it("enters waiting state when installed but isReady() is false, then connects on ai-ecosystem:ready", () => {
      const { api, registered } = createFakeApi({ ready: false });
      const { plugin, triggerLayoutReady, triggerWorkspace } = createHarness(api);
      const statuses: ConnectorStatus[] = [];

      const connector = new EcosystemConnector(plugin, {
        buildRegistration,
        onStatus: (s) => statuses.push(s),
      });

      connector.start();
      triggerLayoutReady();

      expect(connector.status).toBe("waiting");
      expect(connector.isConnected()).toBe(false);
      expect(registered).toHaveLength(0);

      api.setReady(true);
      triggerWorkspace(ECOSYSTEM_EVENTS.ready, api);

      expect(connector.status).toBe("connected");
      expect(connector.isConnected()).toBe(true);
      expect(registered).toHaveLength(1);
      expect(statuses).toEqual(["waiting", "connected"]);
    });

    it("sets status to missing and calls onMissing() when AI Ecosystem is not installed", () => {
      const { plugin, triggerLayoutReady } = createHarness(undefined);
      let missingCalled = false;

      const connector = new EcosystemConnector(plugin, {
        buildRegistration,
        onMissing: () => {
          missingCalled = true;
        },
      });

      connector.start();
      triggerLayoutReady();

      expect(connector.status).toBe("missing");
      expect(missingCalled).toBe(true);
      expect(connector.isConnected()).toBe(false);
    });

    it("sets status to incompatible and calls onIncompatible(reason) when registerModule returns { ok: false }", () => {
      const { api } = createFakeApi({
        ready: true,
        registerResult: { ok: false, reason: "Unsupported API version 99" },
      });
      const { plugin, triggerLayoutReady } = createHarness(api);
      let incompatibleReason: string | undefined;

      const connector = new EcosystemConnector(plugin, {
        buildRegistration,
        onIncompatible: (reason) => {
          incompatibleReason = reason;
        },
      });

      connector.start();
      triggerLayoutReady();

      expect(connector.status).toBe("incompatible");
      expect(connector.statusDetail).toBe("Unsupported API version 99");
      expect(incompatibleReason).toBe("Unsupported API version 99");
      expect(connector.isConnected()).toBe(false);
    });

    it("reconnects automatically when ai-ecosystem:unloading fires followed by ai-ecosystem:ready, and unregisters on stop()", () => {
      const { api, registered, unregistered } = createFakeApi({ ready: true });
      const { plugin, triggerLayoutReady, triggerWorkspace } = createHarness(api);
      let disconnectedCount = 0;

      const connector = new EcosystemConnector(plugin, {
        buildRegistration,
        onDisconnected: () => {
          disconnectedCount++;
        },
      });

      connector.start();
      triggerLayoutReady();
      expect(connector.status).toBe("connected");
      expect(registered).toHaveLength(1);

      // Simulate AI Ecosystem unload
      triggerWorkspace(ECOSYSTEM_EVENTS.unloading);
      expect(connector.status).toBe("disconnected");
      expect(connector.isConnected()).toBe(false);
      expect(disconnectedCount).toBe(1);

      // Simulate AI Ecosystem reload
      triggerWorkspace(ECOSYSTEM_EVENTS.ready, api);
      expect(connector.status).toBe("connected");
      expect(connector.isConnected()).toBe(true);
      expect(registered).toHaveLength(2);

      // Stop unregisters cleanly
      connector.stop();
      expect(unregistered).toEqual(["ai-templates"]);
      expect(connector.isConnected()).toBe(false);
    });
  });

  describe("dependency-modal (isEcosystemInstalled and installEcosystem)", () => {
    it("detects whether AI Ecosystem is installed and downloads/enables it via requestUrl and internal plugins API", async () => {
      const installPlugin = vi.fn(async (_repo: string, _ver: string, manifest: unknown) => {
        manifests[ECOSYSTEM_ID] = manifest;
      });
      const loadManifests = vi.fn(async () => {});
      const enablePluginAndSave = vi.fn(async (_id: string) => true);
      const manifests: Record<string, unknown> = {};

      const app = {
        plugins: {
          manifests,
          installPlugin,
          loadManifests,
          enablePluginAndSave,
        },
      } as unknown as App;

      expect(isEcosystemInstalled(app)).toBe(false);

      requestUrlMock.handler = async (req: { url: string }) => {
        if (req.url === `https://api.github.com/repos/${ECOSYSTEM_REPO}/releases/latest`) {
          return { text: JSON.stringify({ tag_name: "1.2.0" }) };
        }
        if (req.url === `https://github.com/${ECOSYSTEM_REPO}/releases/download/1.2.0/manifest.json`) {
          return { text: JSON.stringify({ id: ECOSYSTEM_ID, version: "1.2.0" }) };
        }
        throw new Error(`Unexpected URL: ${req.url}`);
      };

      await installEcosystem(app);

      expect(installPlugin).toHaveBeenCalledWith(ECOSYSTEM_REPO, "1.2.0", {
        id: ECOSYSTEM_ID,
        version: "1.2.0",
      });
      expect(loadManifests).toHaveBeenCalledTimes(1);
      expect(enablePluginAndSave).toHaveBeenCalledWith(ECOSYSTEM_ID);
      expect(isEcosystemInstalled(app)).toBe(true);

      // Calling installEcosystem when already installed skips download and just loads + enables
      installPlugin.mockClear();
      await installEcosystem(app);
      expect(installPlugin).not.toHaveBeenCalled();
      expect(enablePluginAndSave).toHaveBeenCalledTimes(2);

      // Also verify MissingEcosystemModal opens and closes cleanly
      const modal = new MissingEcosystemModal(app);
      modal.open();
      expect(modal.titleEl.textContent).toContain(t("dependency.title"));
      modal.close();
    });
  });
});
