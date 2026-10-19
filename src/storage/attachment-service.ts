// Images and attachments (plan section 5). Three ways to send an image, cheapest first:
//   1. an absolute path of a local file (a few tokens; read only from allowed folders);
//   2. the name of a file that already is in the vault (nothing is written);
//   3. base64 (many tokens; limited in size).
// New files go where the vault wants attachments, through the public
// FileManager.getAvailablePathForAttachment API.
import { PathError, UserError } from "../errors";
import { ImageValue } from "../engine/image-value";
import { safeFilename, slugify } from "../engine/filters";
import { IMAGE_EXTENSIONS, checkLocalFile, extensionOf, isImageExtension } from "./path-guard";
import type { FsPort, ImageExtension } from "./path-guard";
import type { VaultPort } from "./vault-port";

export interface AttachmentDeps {
  vault: VaultPort;
  fs: FsPort;
  getAllowedFolders: () => readonly string[];
  getBase64LimitMb: () => number;
  /** Creates the folders of a vault directory path. */
  ensureFolder: (dir: string) => Promise<void>;
}

export interface ResolveContext {
  /** Field name, used to name base64 images. */
  field: string;
  /** Vault path of the note the image will be embedded in. */
  sourcePath: string;
  /** False for previews: check everything, write nothing. */
  save: boolean;
}

export type AttachmentSource = "local" | "vault" | "base64";

export interface SavedAttachment {
  field: string;
  /** Vault path of the attachment. */
  vaultPath: string;
  source: AttachmentSource;
  /** True when a new file was written (false for files that already were in the vault). */
  created: boolean;
  bytes: number;
}

export interface ResolvedAttachment {
  value: ImageValue;
  source: AttachmentSource;
  /** Present when `save` was true and a file was written. */
  saved?: SavedAttachment;
}

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
const DATA_URI = /^data:([^;,]*)(?:;[^,]*)*;base64,/i;
const MIN_BASE64_CHARS_FOR_BARE = 256;

/** Detects the image type from the first bytes. */
export function detectImageType(bytes: Uint8Array): ImageExtension | undefined {
  const starts = (...sig: number[]): boolean => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "png";
  if (starts(0xff, 0xd8, 0xff)) return "jpg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (starts(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "webp";
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "svg";
  return undefined;
}

function looksLikeAbsolutePath(text: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(text) || text.startsWith("\\\\") || text.startsWith("/");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

interface ImageInput {
  kind: AttachmentSource;
  /** Path, vault link or base64 text. */
  value: string;
  filename?: string;
}

export class AttachmentService {
  constructor(private readonly deps: AttachmentDeps) {}

  /** Shape check used by data validation, before any file is touched. Returns an error text or undefined. */
  describeInputProblem(input: unknown): string | undefined {
    try {
      this.classify(input);
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  private classify(input: unknown): ImageInput {
    if (typeof input === "string") {
      const text = input.trim();
      if (text === "") throw new UserError("the image is empty.");
      if (DATA_URI.test(text)) return { kind: "base64", value: text };
      const compact = text.replace(/\s+/g, "");
      if (compact.length >= MIN_BASE64_CHARS_FOR_BARE && BASE64_BODY.test(compact)) return { kind: "base64", value: compact };
      if (looksLikeAbsolutePath(text)) return { kind: "local", value: text };
      return { kind: "vault", value: text };
    }
    if (typeof input === "object" && input !== null && !Array.isArray(input)) {
      const obj = input as Record<string, unknown>;
      const filename = typeof obj.filename === "string" ? obj.filename : undefined;
      if (typeof obj.path === "string") return { kind: "local", value: obj.path.trim() };
      if (typeof obj.base64 === "string") return { kind: "base64", value: obj.base64.trim(), filename };
      const vault = obj.vault ?? obj.name;
      if (typeof vault === "string") return { kind: "vault", value: vault.trim() };
    }
    throw new UserError(
      'an image must be the absolute path of a local file, the name of a file that is already in the vault, ' +
        'base64 text, or an object { "path" } / { "base64", "filename"? } / { "vault" }.',
    );
  }

  async resolve(input: unknown, ctx: ResolveContext): Promise<ResolvedAttachment> {
    const classified = this.classify(input);
    switch (classified.kind) {
      case "local":
        return this.fromLocal(classified.value, ctx);
      case "base64":
        return this.fromBase64(classified.value, classified.filename, ctx);
      case "vault":
        return this.fromVault(classified.value, ctx);
    }
  }

  // ---- existing vault file --------------------------------------------------

  private fromVault(name: string, ctx: ResolveContext): ResolvedAttachment {
    const wiki = /^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(name);
    const target = (wiki?.[1] ?? name).trim();
    const found = this.deps.vault.findFile(target, ctx.sourcePath);
    if (!found) {
      throw new UserError(
        `the image "${target}" was not found. Send the absolute path of a local file in an allowed folder, ` +
          `the name of a file that already is in the vault, or base64.`,
        "not_found",
      );
    }
    const ext = extensionOf(found);
    if (!isImageExtension(ext)) {
      throw new PathError(`"${found}" is not an accepted image or attachment type (${IMAGE_EXTENSIONS.join(", ")}).`);
    }
    const linkText = this.deps.vault.linkTextFor(found, ctx.sourcePath);
    return { value: new ImageValue(found, linkText), source: "vault" };
  }

  // ---- local file -----------------------------------------------------------

  private async fromLocal(path: string, ctx: ResolveContext): Promise<ResolvedAttachment> {
    const file = await checkLocalFile(path, { fs: this.deps.fs, allowedFolders: this.deps.getAllowedFolders() });
    const filename = this.cleanFilename(file.filename, file.extension);
    if (!ctx.save) return { value: new ImageValue(filename, filename), source: "local" };
    const bytes = await this.deps.fs.readFile(file.realPath);
    return this.store(bytes, filename, "local", ctx);
  }

  // ---- base64 ---------------------------------------------------------------

  private async fromBase64(text: string, requestedName: string | undefined, ctx: ResolveContext): Promise<ResolvedAttachment> {
    const body = text.replace(DATA_URI, "").replace(/\s+/g, "");
    if (body === "" || !BASE64_BODY.test(body)) throw new UserError("the base64 text is not valid base64.");
    const limitBytes = Math.floor(this.deps.getBase64LimitMb() * 1024 * 1024);
    const estimated = Math.floor((body.length * 3) / 4);
    if (estimated > limitBytes) {
      throw new UserError(
        `the base64 image is about ${estimated} bytes; the limit is ${limitBytes} bytes. ` +
          `Save the image to a local file in an allowed folder and send its path instead (it also costs far fewer tokens).`,
        "too_large",
      );
    }
    let bytes: Uint8Array;
    try {
      const binary = atob(body);
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    } catch {
      throw new UserError("the base64 text could not be decoded.");
    }
    const type = detectImageType(bytes);
    if (!type) {
      throw new UserError(`the base64 data is not one of the accepted types (${IMAGE_EXTENSIONS.join(", ")}).`);
    }
    const stem = requestedName ? safeFilename(requestedName.replace(/\.[A-Za-z0-9]{1,5}$/, "")) : "";
    const filename = `${stem || slugify(ctx.field) || "image"}.${type}`;
    if (!ctx.save) return { value: new ImageValue(filename, filename), source: "base64" };
    return this.store(bytes, filename, "base64", ctx);
  }

  // ---- writing --------------------------------------------------------------

  private cleanFilename(filename: string, ext: ImageExtension): string {
    const stem = safeFilename(filename.replace(/\.[A-Za-z0-9]{1,5}$/, ""));
    return `${stem || "image"}.${ext}`;
  }

  private async store(bytes: Uint8Array, filename: string, source: AttachmentSource, ctx: ResolveContext): Promise<ResolvedAttachment> {
    const { vault } = this.deps;
    const target = await vault.availableAttachmentPath(filename, ctx.sourcePath);
    const slash = target.lastIndexOf("/");
    await this.deps.ensureFolder(slash === -1 ? "" : target.slice(0, slash));
    await vault.createBinary(target, toArrayBuffer(bytes));
    const linkText = vault.linkTextFor(target, ctx.sourcePath);
    return {
      value: new ImageValue(target, linkText),
      source,
      saved: { field: ctx.field, vaultPath: target, source, created: true, bytes: bytes.byteLength },
    };
  }
}
