import { describe, expect, it, vi } from "vitest";
import type { HubCallContext, SecretVaultService } from "../../src/ecosystem/types";
import { TemplateEngine } from "../../src/engine/template-engine";
import { AttachmentService } from "../../src/storage/attachment-service";
import { NoteCreator } from "../../src/storage/note-creator";
import { TemplateCreator } from "../../src/templates/template-creator";
import { TemplateLoader } from "../../src/templates/template-loader";
import { TemplateService } from "../../src/templates/template-service";
import { buildTools } from "../../src/tools/templates-module";
import { DEFAULT_SETTINGS } from "../../src/types/template-types";
import { MemoryVault } from "../storage/attachment-and-notes.test";

const CTX: HubCallContext = { client: { id: "c", name: "Claude Code" }, moduleId: "ai-templates" };
const VALUE = "super-secret-value";
const redact = (text: string): string => text.split(VALUE).join("[REDACTED]");

async function setup(secrets: SecretVaultService | undefined) {
  const vault = new MemoryVault();
  const settings = { ...DEFAULT_SETTINGS };
  const engine = new TemplateEngine();
  const notes = new NoteCreator(vault);
  const attachments = new AttachmentService({
    vault,
    fs: {
      tmpdir: () => "/tmp",
      realpath: async (p) => p,
      stat: async () => ({ isFile: true, size: 1 }),
      readFile: async () => new Uint8Array(),
    },
    getAllowedFolders: () => settings.allowedImageFolders,
    getBase64LimitMb: () => settings.base64LimitMb,
    ensureFolder: (dir) => notes.ensureFolder(dir),
  });
  const loader = new TemplateLoader({ vault, engine, getFolder: () => settings.templatesFolder });
  const creator = new TemplateCreator({ vault, engine, loader, notes, getFolder: () => settings.templatesFolder });
  const activities: unknown[] = [];
  const service = new TemplateService({
    vault,
    engine,
    loader,
    attachments,
    notes,
    creator,
    getSettings: () => settings,
    getSecrets: () => secrets,
    logActivity: (entry) => activities.push(entry),
  });
  await vault.createText(
    "Templates/AI/conn.md",
    [
      "---",
      "template_id: conn",
      "description: Connection",
      "target_path: Out/{{ nome | slug }}.md",
      "fields:",
      "  nome: string",
      "  token: string",
      "---",
      "Token: {{ token }}",
      "",
    ].join("\n"),
  );
  const tools = buildTools(service, loader, redact);
  const call = (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(name);
    return tool.handler(args, CTX);
  };
  return { vault, call, activities };
}

function secretsService() {
  const resolveTemplateData = vi.fn(
    async (data: unknown, _caller: string) => JSON.parse(JSON.stringify(data).replace("{{secret:TOKEN}}", VALUE)) as unknown,
  );
  const service: SecretVaultService = { redact, resolveTemplateData };
  return { service, resolveTemplateData };
}

describe("secret values in template data", () => {
  it("resolves placeholders on create, writes the real value to the note and redacts the result", async () => {
    const { service, resolveTemplateData } = secretsService();
    const { vault, call, activities } = await setup(service);
    const result = await call("create_note_from_template", {
      template_id: "conn",
      data: { nome: "Jira", token: "{{secret:TOKEN}}" },
    });
    expect(resolveTemplateData).toHaveBeenCalledTimes(1);
    expect(resolveTemplateData.mock.calls[0]?.[1]).toBe("ai-templates");
    expect(vault.files.get("Out/jira.md")).toContain(`Token: ${VALUE}`);
    expect(result.isError).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(VALUE);
    expect(JSON.stringify(activities)).not.toContain(VALUE);
    expect(JSON.stringify(activities)).toContain("{{secret:TOKEN}}");
  });

  it("does not resolve on preview and keeps the placeholder", async () => {
    const { service, resolveTemplateData } = secretsService();
    const { call } = await setup(service);
    const result = await call("preview_template", {
      template_id: "conn",
      data: { nome: "Jira", token: "{{secret:TOKEN}}" },
    });
    expect(resolveTemplateData).not.toHaveBeenCalled();
    const text = JSON.stringify(result);
    expect(text).toContain("{{secret:TOKEN}}");
    expect(text).not.toContain(VALUE);
  });

  it("redacts values typed in clear text in the preview and in errors", async () => {
    const { service } = secretsService();
    const { call } = await setup(service);
    const preview = await call("preview_template", { template_id: "conn", data: { nome: "Jira", token: VALUE } });
    expect(JSON.stringify(preview)).not.toContain(VALUE);
    expect(JSON.stringify(preview)).toContain("[REDACTED]");
    const failed = await call("preview_template", { template_id: "conn", data: { nome: VALUE, token: 5 } });
    expect(JSON.stringify(failed)).not.toContain(VALUE);
  });

  it("works unchanged without the secrets service or without the optional method", async () => {
    const withoutMethod: SecretVaultService = { redact: (t) => t };
    for (const secrets of [undefined, withoutMethod]) {
      const { vault, call } = await setup(secrets);
      const result = await call("create_note_from_template", { template_id: "conn", data: { nome: "Plain", token: "abc" } });
      expect(result.isError).toBeUndefined();
      expect(vault.files.get("Out/plain.md")).toContain("Token: abc");
    }
  });
});
