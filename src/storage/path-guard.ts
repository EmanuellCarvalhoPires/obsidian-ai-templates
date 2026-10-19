// Path rules (plan section 6). Two kinds of paths come from the AI agent:
//
// - vault paths (target_path, data_file): must stay inside the vault and outside the Obsidian
//   configuration folder;
// - disk paths of local images: must resolve (symlinks included) into an allowed folder and
//   point to a known image or attachment type.
//
// Everything here is pure except the injected FsPort, so tests run without a disk.
import * as nodePath from "node:path";
import { normalizePath } from "obsidian";
import { PathError } from "../errors";
import { TMPDIR_TOKEN } from "../types/template-types";

/** Extensions accepted for images and attachments. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"] as const;
export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

/** Largest local image or attachment that is read from disk. */
export const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const SEGMENT_FORBIDDEN = /[:*?"<>|]/;

/** The disk operations the guard and the attachment service need. Injected so tests can fake them. */
export interface FsPort {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ isFile: boolean; size: number }>;
  readFile(path: string): Promise<Uint8Array>;
  tmpdir(): string;
}

export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isImageExtension(ext: string): ext is ImageExtension {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

// ---------------------------------------------------------------------------
// Vault paths
// ---------------------------------------------------------------------------

export interface VaultPathOptions {
  /** `app.vault.configDir` (usually ".obsidian"; users can rename it). */
  configDir: string;
  /** Name of the parameter, for messages ("target_path", "data_file"). */
  label: string;
}

/**
 * Validates a vault-relative path and returns it normalized. Refuses: empty values, control
 * characters, `..`, absolute paths (POSIX, drive letters, UNC), `~`, characters Windows rejects
 * and the Obsidian configuration folder (case-insensitive).
 */
export function checkVaultPath(raw: unknown, options: VaultPathOptions): string {
  const { label } = options;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new PathError(`${label} must be a non-empty path relative to the vault.`);
  }
  if (/\p{Cc}/u.test(raw)) {
    throw new PathError(`${label} contains control characters (line breaks or tabs). Use a single-line path.`);
  }
  const unified = raw.trim().replace(/\\/g, "/");
  if (unified.startsWith("//")) {
    throw new PathError(`${label} "${raw}" is a network (UNC) path. Use a path relative to the vault.`);
  }
  if (/^[A-Za-z]:/.test(unified)) {
    throw new PathError(`${label} "${raw}" starts with a drive letter. Use a path relative to the vault.`);
  }
  if (unified.startsWith("/")) {
    throw new PathError(`${label} "${raw}" is an absolute path. Use a path relative to the vault.`);
  }
  if (unified.startsWith("~")) {
    throw new PathError(`${label} "${raw}" starts with "~". Use a path relative to the vault.`);
  }

  const segments = unified.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.length === 0) throw new PathError(`${label} must name a file inside the vault.`);
  if (segments.some((s) => s === "..")) {
    throw new PathError(`${label} "${raw}" contains "..". The path must stay inside the vault.`);
  }
  for (const segment of segments) {
    if (SEGMENT_FORBIDDEN.test(segment)) {
      throw new PathError(
        `${label} "${raw}" has a character that file names cannot contain (one of : * ? " < > |) in "${segment}". ` +
          `If it comes from a field, pass the value through the slug or safe_filename filter.`,
      );
    }
    if (/[. ]$/.test(segment)) {
      throw new PathError(`${label} "${raw}": "${segment}" ends with a dot or a space, which Windows does not allow.`);
    }
    if (WINDOWS_RESERVED.test(segment)) {
      throw new PathError(`${label} "${raw}": "${segment}" is a reserved name on Windows.`);
    }
  }

  const normalized = normalizePath(segments.join("/"));
  const lower = normalized.toLowerCase();
  const config = normalizePath(options.configDir).toLowerCase();
  if (config !== "" && (lower === config || lower.startsWith(`${config}/`))) {
    throw new PathError(`${label} "${raw}" points into the Obsidian configuration folder, which is off limits.`);
  }
  return normalized;
}

/** Notes are Markdown: a path without the .md extension gets it. */
export function toMarkdownPath(path: string): string {
  return path.toLowerCase().endsWith(".md") ? path : `${path}.md`;
}

// ---------------------------------------------------------------------------
// Local image files
// ---------------------------------------------------------------------------

/** Replaces the {tmpdir} token of the settings with the system temporary folder. */
export function expandAllowedFolders(folders: readonly string[], tmpdir: string): string[] {
  const out: string[] = [];
  for (const folder of folders) {
    const trimmed = folder.trim();
    if (trimmed === "") continue;
    const expanded = trimmed.startsWith(TMPDIR_TOKEN) ? tmpdir + trimmed.slice(TMPDIR_TOKEN.length) : trimmed;
    const resolved = nodePath.resolve(expanded);
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}

function isInside(base: string, target: string, caseInsensitive: boolean): boolean {
  const a = caseInsensitive ? base.toLowerCase() : base;
  const b = caseInsensitive ? target.toLowerCase() : target;
  const rel = nodePath.relative(a, b);
  return rel === "" || (!rel.startsWith("..") && !nodePath.isAbsolute(rel));
}

export interface LocalFileOptions {
  fs: FsPort;
  /** Folder list from the settings (may contain the {tmpdir} token). */
  allowedFolders: readonly string[];
  maxBytes?: number;
  /** Defaults to true on Windows and macOS. */
  caseInsensitive?: boolean;
}

export interface LocalFile {
  /** The path after resolving symlinks. */
  realPath: string;
  extension: ImageExtension;
  /** File name to give the attachment. */
  filename: string;
  size: number;
}

/**
 * Checks a local image path from an agent and returns the real file. Refuses: relative paths,
 * URLs, unknown extensions (also behind a symlink), files outside the allowed folders after
 * resolving symlinks, directories and files above the size limit.
 */
export async function checkLocalFile(raw: unknown, options: LocalFileOptions): Promise<LocalFile> {
  const { fs } = options;
  if (typeof raw !== "string" || raw.trim() === "") throw new PathError("The image path is empty.");
  const input = raw.trim();
  if (/\p{Cc}/u.test(input)) throw new PathError("The image path contains control characters.");
  if (/^[a-z][a-z0-9+.-]{1,}:\/\//i.test(input)) {
    throw new PathError(`"${input}" is a URL. Save the image to a file in an allowed folder and send its path instead.`);
  }
  if (!nodePath.isAbsolute(input)) {
    throw new PathError(`The image path "${input}" is not absolute. Send the full path of the file on disk.`);
  }
  const resolved = nodePath.resolve(input);
  const declaredExt = extensionOf(resolved);
  if (!isImageExtension(declaredExt)) {
    throw new PathError(
      `"${input}" has ${declaredExt ? `the extension .${declaredExt}` : "no extension"}, which is not accepted. ` +
        `Accepted: ${IMAGE_EXTENSIONS.join(", ")}.`,
    );
  }

  const caseInsensitive = options.caseInsensitive ?? (process.platform === "win32" || process.platform === "darwin");
  const allowed = expandAllowedFolders(options.allowedFolders, fs.tmpdir());
  if (allowed.length === 0) {
    throw new PathError("No folder is allowed for local images. Add one in the AI Templates settings.");
  }

  let real: string;
  try {
    real = await fs.realpath(resolved);
  } catch {
    throw new PathError(`The image file "${input}" does not exist or cannot be read.`);
  }

  const allowedReal: string[] = [];
  for (const folder of allowed) {
    try {
      allowedReal.push(await fs.realpath(folder));
    } catch {
      allowedReal.push(folder);
    }
  }
  if (!allowedReal.some((folder) => isInside(folder, real, caseInsensitive))) {
    throw new PathError(
      `The image "${input}" is outside the folders allowed for local images (${allowed.join(", ")}). ` +
        `Save it in one of them, or ask the user to add its folder in the AI Templates settings.`,
    );
  }

  const realExt = extensionOf(real);
  if (!isImageExtension(realExt)) {
    throw new PathError(`"${input}" points to a file that is not an image or attachment (.${realExt || "no extension"}).`);
  }

  let stat: { isFile: boolean; size: number };
  try {
    stat = await fs.stat(real);
  } catch {
    throw new PathError(`The image file "${input}" cannot be read.`);
  }
  if (!stat.isFile) throw new PathError(`"${input}" is not a file.`);
  const max = options.maxBytes ?? MAX_LOCAL_FILE_BYTES;
  if (stat.size > max) {
    throw new PathError(`The image "${input}" is ${stat.size} bytes; the limit is ${max} bytes.`);
  }
  const filename = resolved.split(/[\\/]/).pop() ?? `image.${declaredExt}`;
  return { realPath: real, extension: declaredExt, filename, size: stat.size };
}
