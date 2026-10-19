// The template engine: LiquidJS with no eval, no file access and hard limits (plan section 2).
//
// - Liquid is an interpreter: a template never becomes JavaScript code.
// - `include`, `render`, `layout` and `block` are removed, so a template cannot read files.
// - `outputEscape` is off in the Obsidian channel: `&`, `<` and quotes stay as written.
//   The Telegram channel escapes every value except the tables the plugin itself builds.
// - parseLimit, renderLimit and memoryLimit stop runaway templates before they hang Obsidian.
import { Liquid, type Template } from "liquidjs";
import type { RenderChannel } from "../types/template-types";
import { formatDate } from "./clock";
import { registerFilters } from "./filters";
import { SafeHtml } from "./image-value";
import { escapeTelegramHtml } from "./table-formatter";

export interface EngineLimits {
  /** Largest template source accepted, in characters. */
  parseLimit: number;
  /** Largest render time, in milliseconds. */
  renderLimit: number;
  /** Largest amount of memory a render may allocate (Liquid counts new strings, arrays and ranges). */
  memoryLimit: number;
}

export const DEFAULT_LIMITS: EngineLimits = {
  parseLimit: 200_000,
  renderLimit: 2_000,
  memoryLimit: 32_000_000,
};

/** Variables every template can use without declaring them in `fields`. */
export const BUILTIN_VARIABLES: readonly string[] = ["today", "now_iso"];

export interface EngineOptions {
  /** Clock, replaced in tests. */
  now?: () => Date;
  /** Read at render time, so a settings change applies at once. */
  classicMarkdownLinks?: () => boolean;
  limits?: Partial<EngineLimits>;
}

export type TemplateErrorKind = "syntax" | "render" | "limit";

/** A template that cannot be parsed or rendered. The message is meant to be shown to the AI agent. */
export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly kind: TemplateErrorKind,
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(message);
    this.name = "TemplateError";
  }
}

export type ValidationResult =
  | { ok: true; /** Top-level variables the template reads (loop and assign variables excluded). */ variables: string[] }
  | { ok: false; error: TemplateError };

const POSITION_SUFFIX = /,\s*line:(\d+),\s*col:(\d+)\s*$/;
const REMOVED_TAGS = ["include", "render", "layout", "block"];

interface LiquidErrorLike {
  message?: unknown;
  name?: unknown;
  token?: { getPosition?: () => number[] };
}

function toTemplateError(err: unknown, phase: "parse" | "render"): TemplateError {
  if (err instanceof TemplateError) return err;
  const like = (err ?? {}) as LiquidErrorLike;
  const raw = typeof like.message === "string" ? like.message : String(err);
  const match = POSITION_SUFFIX.exec(raw);
  let line = match ? Number(match[1]) : undefined;
  let column = match ? Number(match[2]) : undefined;
  if (line === undefined) {
    const pos = like.token?.getPosition?.();
    if (pos && pos.length >= 2) [line, column] = [pos[0], pos[1]];
  }
  const text = (match ? raw.slice(0, match.index) : raw).trim();
  const where = line !== undefined ? ` (line ${line}, column ${column ?? 1})` : "";
  const limit = /limit exceeded/i.test(text);
  const kind: TemplateErrorKind = limit ? "limit" : phase === "parse" ? "syntax" : "render";
  const prefix = limit ? "The template used too many resources and was stopped: " : "";
  return new TemplateError(`${prefix}${text}${where}`, kind, line, column);
}

function telegramEscape(value: unknown): string {
  if (value instanceof SafeHtml) return value.html;
  if (value === undefined || value === null) return "";
  return escapeTelegramHtml(Array.isArray(value) ? value.map((v) => String(v)).join("") : String(value));
}

export class TemplateEngine {
  private readonly engines = new Map<RenderChannel, Liquid>();
  private readonly now: () => Date;
  private readonly classicLinks: () => boolean;
  private readonly limits: EngineLimits;

  constructor(options: EngineOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.classicLinks = options.classicMarkdownLinks ?? (() => false);
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
  }

  private engineFor(channel: RenderChannel): Liquid {
    const cached = this.engines.get(channel);
    if (cached) return cached;
    const engine = new Liquid({
      strictFilters: true,
      strictVariables: false,
      ownPropertyOnly: true,
      jsTruthy: false,
      // An empty in-memory template map: no lookup can ever reach the disk.
      templates: {},
      outputEscape: channel === "telegram" ? telegramEscape : undefined,
      parseLimit: this.limits.parseLimit,
      renderLimit: this.limits.renderLimit,
      memoryLimit: this.limits.memoryLimit,
    });
    for (const name of REMOVED_TAGS) delete engine.tags[name];
    registerFilters(engine, { channel, now: this.now, classicMarkdownLinks: this.classicLinks });
    this.engines.set(channel, engine);
    return engine;
  }

  private parse(source: string, channel: RenderChannel): Template[] {
    try {
      return this.engineFor(channel).parse(source);
    } catch (err) {
      throw toTemplateError(err, "parse");
    }
  }

  /** Renders a template source with the given data. Throws TemplateError. */
  render(source: string, data: Record<string, unknown>, channel: RenderChannel = "obsidian"): string {
    const engine = this.engineFor(channel);
    const parsed = this.parse(source, channel);
    const now = this.now();
    try {
      const out: unknown = engine.renderSync(parsed, data, {
        globals: { today: formatDate(now, "YYYY-MM-DD"), now_iso: now.toISOString() },
        templateLimit: 500_000,
      });
      return typeof out === "string" ? out : String(out ?? "");
    } catch (err) {
      throw toTemplateError(err, "render");
    }
  }

  /** Parses a template and lists the variables it reads, or the exact syntax error. */
  validate(source: string): ValidationResult {
    try {
      const parsed = this.parse(source, "obsidian");
      const variables = this.engineFor("obsidian").globalVariablesSync(parsed);
      return { ok: true, variables: Array.from(new Set(variables)) };
    } catch (err) {
      return { ok: false, error: toTemplateError(err, "parse") };
    }
  }
}
