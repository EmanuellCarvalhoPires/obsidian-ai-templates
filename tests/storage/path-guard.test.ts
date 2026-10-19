import * as nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { PathError } from "../../src/errors";
import {
  checkLocalFile,
  checkVaultPath,
  expandAllowedFolders,
  extensionOf,
  isImageExtension,
  toMarkdownPath,
  type FsPort,
} from "../../src/storage/path-guard";

describe("path-guard", () => {
  describe("checkVaultPath", () => {
    const opts = { configDir: ".obsidian", label: "target_path" };

    it("accepts valid relative paths and normalizes slashes and dot segments", () => {
      expect(checkVaultPath("Notes/Daily/2026-10-19.md", opts)).toBe("Notes/Daily/2026-10-19.md");
      expect(checkVaultPath("  Notes\\Sub\\\\Item.md  ", opts)).toBe("Notes/Sub/Item.md");
      expect(checkVaultPath("./Folder/./Note.md", opts)).toBe("Folder/Note.md");
    });

    it("rejects empty values, non-strings, and control characters", () => {
      expect(() => checkVaultPath("", opts)).toThrow(PathError);
      expect(() => checkVaultPath("   ", opts)).toThrow(PathError);
      expect(() => checkVaultPath(null, opts)).toThrow(PathError);
      expect(() => checkVaultPath("   .   ", opts)).toThrow(PathError);
      expect(() => checkVaultPath("Notes/bad\nname.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("Notes/bad\tname.md", opts)).toThrow(PathError);
    });

    it("rejects .. traversal, POSIX absolute paths, Windows drive letters, UNC paths, and ~", () => {
      expect(() => checkVaultPath("../outside.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("Notes/../../outside.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("/foo/bar.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("C:\\foo\\bar.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("d:/foo/bar.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("\\\\server\\share\\file.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("//server/share/file.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("~/Notes/file.md", opts)).toThrow(PathError);
    });

    it("rejects forbidden Windows characters, trailing dots/spaces, and reserved names", () => {
      for (const ch of [":", "*", "?", '"', "<", ">", "|"]) {
        expect(() => checkVaultPath(`Notes/bad${ch}name.md`, opts)).toThrow(PathError);
      }
      expect(() => checkVaultPath("Notes/trailing./file.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("CON", opts)).toThrow(PathError);
      expect(() => checkVaultPath("Notes/NUL.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("Notes/aux.txt", opts)).toThrow(PathError);
      expect(() => checkVaultPath("Notes/COM1.md", opts)).toThrow(PathError);
      expect(() => checkVaultPath("Notes/LPT9.md", opts)).toThrow(PathError);
    });

    it("rejects paths inside configDir (.obsidian or custom, case-insensitive)", () => {
      expect(() => checkVaultPath(".obsidian", opts)).toThrow(PathError);
      expect(() => checkVaultPath(".obsidian/plugins/ai-templates/data.json", opts)).toThrow(PathError);
      expect(() => checkVaultPath(".OBSIDIAN/workspace.json", opts)).toThrow(PathError);

      const customOpts = { configDir: ".custom-config", label: "target_path" };
      expect(() => checkVaultPath(".Custom-Config/app.json", customOpts)).toThrow(PathError);
      expect(checkVaultPath(".obsidian/allowed-when-custom.md", customOpts)).toBe(".obsidian/allowed-when-custom.md");
    });
  });

  describe("toMarkdownPath, extensionOf, isImageExtension", () => {
    it("adds .md when missing and keeps existing .md (case-insensitive)", () => {
      expect(toMarkdownPath("Notes/Test")).toBe("Notes/Test.md");
      expect(toMarkdownPath("Notes/Test.md")).toBe("Notes/Test.md");
      expect(toMarkdownPath("Notes/Test.MD")).toBe("Notes/Test.MD");
    });

    it("extracts extensions and checks allowed image/attachment extensions", () => {
      expect(extensionOf("foo/bar/Pic.PNG")).toBe("png");
      expect(extensionOf("noext")).toBe("");
      expect(isImageExtension("png")).toBe(true);
      expect(isImageExtension("pdf")).toBe(true);
      expect(isImageExtension("exe")).toBe(false);
    });
  });

  describe("expandAllowedFolders and checkLocalFile", () => {
    const tmpBase = nodePath.resolve("/tmp/ai-test-tmp");
    const allowedDir = nodePath.join(tmpBase, "claude");
    const outsideDir = nodePath.resolve("/var/secret");

    function createFakeFs(
      files: Record<string, { real?: string; isFile?: boolean; size?: number }>,
    ): FsPort {
      return {
        tmpdir: () => tmpBase,
        realpath: async (p: string) => {
          const norm = nodePath.resolve(p);
          if (norm === tmpBase || norm === allowedDir) return norm;
          const entry = files[norm];
          if (!entry) throw new Error(`ENOENT: ${norm}`);
          return entry.real ?? norm;
        },
        stat: async (p: string) => {
          const norm = nodePath.resolve(p);
          const entry = files[norm];
          if (!entry) throw new Error(`ENOENT: ${norm}`);
          return { isFile: entry.isFile ?? true, size: entry.size ?? 1024 };
        },
        readFile: async () => new Uint8Array([1, 2, 3]),
      };
    }

    it("expands {tmpdir} and deduplicates allowed folders", () => {
      const expanded = expandAllowedFolders(["{tmpdir}", "{tmpdir}/claude", "  ", "{tmpdir}"], tmpBase);
      expect(expanded).toEqual([tmpBase, allowedDir]);
    });

    it("accepts a valid image file inside an allowed folder", async () => {
      const validFile = nodePath.join(allowedDir, "chart.png");
      const fs = createFakeFs({
        [validFile]: { isFile: true, size: 2048 },
      });

      const res = await checkLocalFile(validFile, {
        fs,
        allowedFolders: ["{tmpdir}/claude"],
      });

      expect(res).toEqual({
        realPath: validFile,
        extension: "png",
        filename: "chart.png",
        size: 2048,
      });
    });

    it("rejects empty paths, URLs, relative paths, and disallowed extensions", async () => {
      const fs = createFakeFs({});
      const allowedFolders = ["{tmpdir}"];

      await expect(checkLocalFile("", { fs, allowedFolders })).rejects.toThrow(PathError);
      await expect(checkLocalFile("https://example.com/a.png", { fs, allowedFolders })).rejects.toThrow(PathError);
      await expect(checkLocalFile("relative/path/a.png", { fs, allowedFolders })).rejects.toThrow(PathError);
      await expect(
        checkLocalFile(nodePath.join(tmpBase, "script.exe"), { fs, allowedFolders }),
      ).rejects.toThrow(PathError);
    });

    it("rejects files outside allowed folders, including symlinks escaping to outside", async () => {
      const outsideFile = nodePath.join(outsideDir, "secret.png");
      const symlinkInside = nodePath.join(allowedDir, " innocent.png");
      const symlinkToTxt = nodePath.join(allowedDir, "trick.png");
      const realTxtInside = nodePath.join(allowedDir, "notes.txt");

      const fs = createFakeFs({
        [outsideFile]: { isFile: true, size: 500 },
        [symlinkInside]: { real: outsideFile, isFile: true, size: 500 },
        [symlinkToTxt]: { real: realTxtInside, isFile: true, size: 500 },
        [realTxtInside]: { isFile: true, size: 500 },
      });

      await expect(
        checkLocalFile(outsideFile, { fs, allowedFolders: ["{tmpdir}/claude"] }),
      ).rejects.toThrow(PathError);

      await expect(
        checkLocalFile(symlinkInside, { fs, allowedFolders: ["{tmpdir}/claude"] }),
      ).rejects.toThrow(PathError);

      await expect(
        checkLocalFile(symlinkToTxt, { fs, allowedFolders: ["{tmpdir}/claude"] }),
      ).rejects.toThrow(PathError);
    });

    it("rejects directories and files larger than maxBytes", async () => {
      const dirAsPng = nodePath.join(allowedDir, "folder.png");
      const hugePng = nodePath.join(allowedDir, "huge.png");

      const fs = createFakeFs({
        [dirAsPng]: { isFile: false, size: 0 },
        [hugePng]: { isFile: true, size: 5000 },
      });

      await expect(
        checkLocalFile(dirAsPng, { fs, allowedFolders: ["{tmpdir}/claude"] }),
      ).rejects.toThrow(PathError);

      await expect(
        checkLocalFile(hugePng, { fs, allowedFolders: ["{tmpdir}/claude"], maxBytes: 1000 }),
      ).rejects.toThrow(PathError);
    });
  });
});
