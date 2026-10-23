// The part of the vault that the plugin uses, as a small interface. The Obsidian implementation
// is in obsidian-vault.ts; tests use an in-memory one. All paths are vault-relative and
// already normalized.

export type EntryKind = "file" | "folder";

export interface VaultPort {
  /** `app.vault.configDir`. */
  readonly configDir: string;
  /** What exists at the path, if anything. */
  kind(path: string): EntryKind | undefined;
  createFolder(path: string): Promise<void>;
  /** Creates a new text file. Fails when the path exists. */
  createText(path: string, content: string): Promise<void>;
  /** Replaces the content of an existing file. */
  writeText(path: string, content: string): Promise<void>;
  readText(path: string): Promise<string>;
  /** Atomic read-modify-write of an existing file (`vault.process`). `fn` must be synchronous. */
  processText(path: string, fn: (current: string) => string): Promise<void>;
  createBinary(path: string, data: ArrayBuffer): Promise<void>;
  /** Path where the vault wants a new attachment named `filename`, for a note at `sourcePath`. */
  availableAttachmentPath(filename: string, sourcePath: string): Promise<string>;
  /** Vault path of an existing file that a link text points to (file name or path). */
  findFile(linkpath: string, sourcePath: string): string | undefined;
  /** Shortest unambiguous link text for a file, as `[[...]]` would use. */
  linkTextFor(path: string, sourcePath: string): string;
  /** Vault paths of the Markdown notes inside a folder (recursive). */
  listMarkdown(folder: string): string[];
}
