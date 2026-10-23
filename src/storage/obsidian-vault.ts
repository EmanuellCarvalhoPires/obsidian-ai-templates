import { TFile, TFolder, normalizePath } from "obsidian";
import type { App } from "obsidian";
import type { EntryKind, VaultPort } from "./vault-port";

/** VaultPort on top of the public Obsidian API. */
export class ObsidianVaultPort implements VaultPort {
  constructor(private readonly app: App) {}

  get configDir(): string {
    return this.app.vault.configDir;
  }

  kind(path: string): EntryKind | undefined {
    const entry = this.app.vault.getAbstractFileByPath(path);
    if (entry instanceof TFile) return "file";
    if (entry instanceof TFolder) return "folder";
    return undefined;
  }

  async createFolder(path: string): Promise<void> {
    await this.app.vault.createFolder(path);
  }

  async createText(path: string, content: string): Promise<void> {
    await this.app.vault.create(path, content);
  }

  async writeText(path: string, content: string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) throw new Error(`File not found: ${path}`);
    await this.app.vault.modify(file, content);
  }

  async processText(path: string, fn: (current: string) => string): Promise<void> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) throw new Error(`File not found: ${path}`);
    await this.app.vault.process(file, fn);
  }

  async readText(path: string): Promise<string> {
    const file = this.app.vault.getFileByPath(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return this.app.vault.cachedRead(file);
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<void> {
    await this.app.vault.createBinary(path, data);
  }

  async availableAttachmentPath(filename: string, sourcePath: string): Promise<string> {
    return normalizePath(await this.app.fileManager.getAvailablePathForAttachment(filename, sourcePath));
  }

  findFile(linkpath: string, sourcePath: string): string | undefined {
    const direct = this.app.vault.getFileByPath(normalizePath(linkpath));
    if (direct) return direct.path;
    return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path;
  }

  linkTextFor(path: string, sourcePath: string): string {
    const file = this.app.vault.getFileByPath(path);
    if (!file) return path;
    return this.app.metadataCache.fileToLinktext(file, sourcePath, false);
  }

  listMarkdown(folder: string): string[] {
    const prefix = folder === "" ? "" : `${normalizePath(folder)}/`;
    return this.app.vault
      .getMarkdownFiles()
      .map((file) => file.path)
      .filter((path) => prefix === "" || path.startsWith(prefix))
      .sort();
  }
}
