import * as nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { UserError } from "../../src/errors";
import { AttachmentService, detectImageType } from "../../src/storage/attachment-service";
import { NoteCreator } from "../../src/storage/note-creator";
import type { FsPort } from "../../src/storage/path-guard";
import type { EntryKind, VaultPort } from "../../src/storage/vault-port";

export class MemoryVault implements VaultPort {
  readonly configDir = ".obsidian";
  readonly files = new Map<string, string>();
  readonly binaries = new Map<string, Uint8Array>();
  readonly folders = new Set<string>();

  kind(path: string): EntryKind | undefined {
    if (this.files.has(path) || this.binaries.has(path)) return "file";
    if (this.folders.has(path)) return "folder";
    return undefined;
  }

  async createFolder(path: string): Promise<void> {
    if (this.kind(path) !== undefined) throw new Error(`Already exists: ${path}`);
    this.folders.add(path);
  }

  async createText(path: string, content: string): Promise<void> {
    if (this.kind(path) !== undefined) throw new Error(`Already exists: ${path}`);
    this.files.set(path, content);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async processText(path: string, fn: (current: string) => string): Promise<void> {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`File not found: ${path}`);
    this.files.set(path, fn(text));
  }

  async readText(path: string): Promise<string> {
    const text = this.files.get(path);
    if (text === undefined) throw new Error(`File not found: ${path}`);
    return text;
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.binaries.set(path, new Uint8Array(data));
  }

  async availableAttachmentPath(filename: string, _sourcePath: string): Promise<string> {
    const base = `Attachments/${filename}`;
    if (this.kind(base) === undefined) return base;
    const dot = filename.lastIndexOf(".");
    const stem = dot === -1 ? filename : filename.slice(0, dot);
    const ext = dot === -1 ? "" : filename.slice(dot);
    let n = 1;
    while (this.kind(`Attachments/${stem} ${n}${ext}`) !== undefined) n++;
    return `Attachments/${stem} ${n}${ext}`;
  }

  findFile(linkpath: string, _sourcePath: string): string | undefined {
    const clean = linkpath.replace(/\\/g, "/");
    if (this.files.has(clean) || this.binaries.has(clean)) return clean;
    for (const key of [...this.files.keys(), ...this.binaries.keys()]) {
      if (key === clean || key.endsWith(`/${clean}`)) return key;
    }
    return undefined;
  }

  linkTextFor(path: string, _sourcePath: string): string {
    const slash = path.lastIndexOf("/");
    return slash === -1 ? path : path.slice(slash + 1);
  }

  listMarkdown(folder: string): string[] {
    const prefix = folder === "" ? "" : `${folder}/`;
    return [...this.files.keys()]
      .filter((p) => p.endsWith(".md") && (prefix === "" || p.startsWith(prefix)))
      .sort();
  }
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const SVG_BYTES = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe("detectImageType, AttachmentService, and NoteCreator", () => {
  describe("detectImageType", () => {
    it("detects png, jpg, gif, webp, svg, and pdf magic bytes", () => {
      expect(detectImageType(PNG_BYTES)).toBe("png");
      expect(detectImageType(JPG_BYTES)).toBe("jpg");
      expect(detectImageType(GIF_BYTES)).toBe("gif");
      expect(detectImageType(WEBP_BYTES)).toBe("webp");
      expect(detectImageType(SVG_BYTES)).toBe("svg");
      expect(detectImageType(PDF_BYTES)).toBe("pdf");
      expect(detectImageType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeUndefined();
    });
  });

  describe("AttachmentService", () => {
    const tmpDir = nodePath.resolve("/tmp/ai-attachments");
    const localPng = nodePath.join(tmpDir, "architecture.png");

    function createEnv(base64LimitMb = 2) {
      const vault = new MemoryVault();
      const notes = new NoteCreator(vault);
      const fs: FsPort = {
        tmpdir: () => tmpDir,
        realpath: async (p) => {
          const resolved = nodePath.resolve(p);
          if (resolved === tmpDir || resolved === localPng) return resolved;
          throw new Error("ENOENT");
        },
        stat: async (p) => {
          if (nodePath.resolve(p) === localPng) return { isFile: true, size: PNG_BYTES.byteLength };
          throw new Error("ENOENT");
        },
        readFile: async (p) => {
          if (nodePath.resolve(p) === localPng) return PNG_BYTES;
          throw new Error("ENOENT");
        },
      };
      const service = new AttachmentService({
        vault,
        fs,
        getAllowedFolders: () => ["{tmpdir}"],
        getBase64LimitMb: () => base64LimitMb,
        ensureFolder: (dir) => notes.ensureFolder(dir),
      });
      return { vault, notes, service };
    }

    it("resolves a local file path and copies it to the vault attachment folder when save: true", async () => {
      const { vault, service } = createEnv();
      const resolved = await service.resolve(localPng, {
        field: "diagrama",
        sourcePath: "Notes/Design.md",
        save: true,
      });

      expect(resolved.source).toBe("local");
      expect(resolved.value.vaultPath).toBe("Attachments/architecture.png");
      expect(resolved.value.linkText).toBe("architecture.png");
      expect(resolved.saved).toEqual({
        field: "diagrama",
        vaultPath: "Attachments/architecture.png",
        source: "local",
        created: true,
        bytes: PNG_BYTES.byteLength,
      });
      expect(vault.binaries.get("Attachments/architecture.png")).toEqual(PNG_BYTES);
    });

    it("does not write files when save: false (preview mode)", async () => {
      const { vault, service } = createEnv();
      const localPreview = await service.resolve(localPng, {
        field: "diagrama",
        sourcePath: "Notes/Design.md",
        save: false,
      });
      expect(localPreview.source).toBe("local");
      expect(localPreview.saved).toBeUndefined();
      expect(vault.binaries.size).toBe(0);

      const dataUri = `data:image/png;base64,${toBase64(PNG_BYTES)}`;
      const b64Preview = await service.resolve(dataUri, {
        field: "foto",
        sourcePath: "Notes/Design.md",
        save: false,
      });
      expect(b64Preview.source).toBe("base64");
      expect(b64Preview.value.vaultPath).toBe("foto.png");
      expect(vault.binaries.size).toBe(0);
    });

    it("resolves an existing vault file without duplicating it", async () => {
      const { vault, service } = createEnv();
      await vault.createBinary("Assets/existing-logo.png", PNG_BYTES.buffer.slice(0) as ArrayBuffer);

      const resolved = await service.resolve("existing-logo.png", {
        field: "logo",
        sourcePath: "Notes/Doc.md",
        save: true,
      });

      expect(resolved.source).toBe("vault");
      expect(resolved.value.vaultPath).toBe("Assets/existing-logo.png");
      expect(resolved.value.linkText).toBe("existing-logo.png");
      expect(resolved.saved).toBeUndefined();
      expect(vault.binaries.size).toBe(1);

      // Also works with wikilink syntax ![[existing-logo.png|300]]
      const wikiResolved = await service.resolve("![[existing-logo.png|300]]", {
        field: "logo",
        sourcePath: "Notes/Doc.md",
        save: true,
      });
      expect(wikiResolved.value.vaultPath).toBe("Assets/existing-logo.png");
    });

    it("resolves Base64 (data URI and bare base64), respects size limit in MB, and rejects invalid data", async () => {
      const { vault, service } = createEnv(2);

      // Data URI
      const dataUri = `data:image/png;base64,${toBase64(PNG_BYTES)}`;
      const r1 = await service.resolve(dataUri, {
        field: "Screen Shot",
        sourcePath: "Notes/Doc.md",
        save: true,
      });
      expect(r1.source).toBe("base64");
      expect(r1.value.vaultPath).toBe("Attachments/screen-shot.png");
      expect(vault.binaries.has("Attachments/screen-shot.png")).toBe(true);

      // Bare base64 (>= 256 chars)
      const paddedPng = new Uint8Array(240);
      paddedPng.set(PNG_BYTES, 0);
      const bareB64 = toBase64(paddedPng);
      expect(bareB64.length).toBeGreaterThanOrEqual(256);

      const r2 = await service.resolve(
        { base64: bareB64, filename: "custom-name.png" },
        { field: "chart", sourcePath: "Notes/Doc.md", save: true },
      );
      expect(r2.value.vaultPath).toBe("Attachments/custom-name.png");

      // Size limit exceeded
      const tinyLimitEnv = createEnv(0.00001); // ~10 bytes
      await expect(
        tinyLimitEnv.service.resolve(
          { base64: bareB64 },
          { field: "chart", sourcePath: "Notes/Doc.md", save: true },
        ),
      ).rejects.toThrow(UserError);

      // Invalid base64 / non-image bytes
      const badBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      await expect(
        service.resolve(`data:application/octet-stream;base64,${toBase64(badBytes)}`, {
          field: "bad",
          sourcePath: "Notes/Doc.md",
          save: true,
        }),
      ).rejects.toThrow(UserError);
    });
  });

  describe("NoteCreator", () => {
    it("creates missing parent folders recursively via ensureFolder", async () => {
      const vault = new MemoryVault();
      const creator = new NoteCreator(vault);

      await creator.ensureFolder("Projects/2026/Q4");
      expect(vault.kind("Projects")).toBe("folder");
      expect(vault.kind("Projects/2026")).toBe("folder");
      expect(vault.kind("Projects/2026/Q4")).toBe("folder");

      // Fails if a file is in the way of a folder segment
      await vault.createText("Projects/blocker", "file content");
      await expect(creator.ensureFolder("Projects/blocker/sub")).rejects.toThrow(UserError);
    });

    it("handles incremental collision rule (Nota.md -> Nota 1.md -> Nota 2.md)", async () => {
      const vault = new MemoryVault();
      const creator = new NoteCreator(vault);

      const p0 = creator.plan("Notes/Nota.md", "incremental");
      expect(p0).toEqual({ requested: "Notes/Nota.md", path: "Notes/Nota.md", overwrite: false, renamed: false });
      await creator.write(p0, "First", "incremental");

      const p1 = creator.plan("Notes/Nota.md", "incremental");
      expect(p1).toEqual({ requested: "Notes/Nota.md", path: "Notes/Nota 1.md", overwrite: false, renamed: true });
      await creator.write(p1, "Second", "incremental");

      const p2 = creator.plan("Notes/Nota.md", "incremental");
      expect(p2).toEqual({ requested: "Notes/Nota.md", path: "Notes/Nota 2.md", overwrite: false, renamed: true });
      await creator.write(p2, "Third", "incremental");

      expect(await vault.readText("Notes/Nota.md")).toBe("First");
      expect(await vault.readText("Notes/Nota 1.md")).toBe("Second");
      expect(await vault.readText("Notes/Nota 2.md")).toBe("Third");
    });

    it("handles overwrite and error collision rules", async () => {
      const vault = new MemoryVault();
      const creator = new NoteCreator(vault);

      const initial = creator.plan("Notes/Report.md", "error");
      await creator.write(initial, "Original", "error");

      // Rule "error" throws conflict
      expect(() => creator.plan("Notes/Report.md", "error")).toThrow(UserError);

      // Rule "overwrite" replaces content
      const overPlan = creator.plan("Notes/Report.md", "overwrite");
      expect(overPlan).toEqual({
        requested: "Notes/Report.md",
        path: "Notes/Report.md",
        overwrite: true,
        renamed: false,
      });
      await creator.write(overPlan, "Updated", "overwrite");
      expect(await vault.readText("Notes/Report.md")).toBe("Updated");
    });
  });
});
