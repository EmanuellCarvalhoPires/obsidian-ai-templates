// Deterministic Markdown tables (plan section 4) and the monospace variant for Telegram
// (plan section 7.2). Pure functions, no Obsidian runtime code.
import type { TableMatrix } from "../types/template-types";

/** The input cannot be read as a table. The message is meant to be shown to the AI agent. */
export class TableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableError";
  }
}

export interface TableOptions {
  /**
   * Column order declared by the template. Used for lists of objects: these columns come
   * first, in this order, then any other key in first-seen order. For matrices without
   * headers they become the headers.
   */
  columns?: readonly string[];
}

const MIN_COLUMN_WIDTH = 3;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** Text of a cell value before escaping. null and undefined are empty. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "[object Object]";
  }
}

/** Escapes a cell for a Markdown table: `|` becomes `\|` and line breaks become `<br>`. */
export function escapeCell(value: unknown): string {
  return cellToString(value).replace(/\r\n|\r|\n/g, "<br>").replace(/\|/g, "\\|");
}

// ---------------------------------------------------------------------------
// Display width
// ---------------------------------------------------------------------------

/** Control characters, format characters (zero width space and joiner, BOM...) and combining marks. */
const ZERO_WIDTH = /^[\p{Cc}\p{Cf}\p{M}]$/u;

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0xa4cf) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/**
 * Width of a text in terminal columns: accented letters count 1 (combining marks and zero
 * width characters count 0), CJK and emoji count 2.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    if (ZERO_WIDTH.test(char)) continue;
    const cp = char.codePointAt(0) ?? 0;
    width += isWide(cp) ? 2 : 1;
  }
  return width;
}

/** Pads with spaces to the given display width. */
export function padToWidth(text: string, width: number): string {
  const missing = width - displayWidth(text);
  return missing > 0 ? text + " ".repeat(missing) : text;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

function genericHeader(index: number): string {
  return `Column ${index + 1}`;
}

function headerText(value: unknown, index: number): string {
  const text = cellToString(value).trim();
  return text === "" ? genericHeader(index) : text;
}

function matrixFromRows(headers: string[], rows: unknown[][]): TableMatrix {
  const width = Math.max(headers.length, ...rows.map((r) => r.length));
  const fullHeaders = headers.slice();
  for (let i = fullHeaders.length; i < width; i++) fullHeaders.push(genericHeader(i));
  const fullRows = rows.map((row) => {
    const out = row.slice();
    while (out.length < width) out.push("");
    return out;
  });
  return { headers: fullHeaders, rows: fullRows };
}

function rowsFromObjects(headers: string[], rows: unknown[]): unknown[][] {
  return rows.map((row, index) => {
    if (Array.isArray(row)) return row as unknown[];
    if (isPlainObject(row)) return headers.map((h) => row[h]);
    throw new TableError(`Row ${index + 1} must be an array or an object, got ${describe(row)}.`);
  });
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * Turns the accepted shapes into a matrix:
 * - `{ headers, rows }` (rows are arrays, or objects keyed by header);
 * - a list of objects (columns are the union of keys, see TableOptions.columns).
 * Short rows are padded with empty cells and extra cells are kept under generated headers
 * ("Column 4"). Throws TableError for anything else.
 */
export function normalizeTable(input: unknown, options: TableOptions = {}): TableMatrix {
  const declared = (options.columns ?? []).map((c) => String(c));

  if (Array.isArray(input)) {
    if (input.length === 0) return { headers: declared.slice(), rows: [] };
    if (input.every(isPlainObject)) {
      const headers = declared.slice();
      for (const row of input) {
        for (const key of Object.keys(row)) if (!headers.includes(key)) headers.push(key);
      }
      return { headers, rows: input.map((row) => headers.map((h) => row[h])) };
    }
    if (declared.length > 0 && input.every((r) => Array.isArray(r))) {
      return matrixFromRows(declared, input as unknown[][]);
    }
    throw new TableError(
      "A table must be { headers, rows } or a list of objects (one object per row, one key per column).",
    );
  }

  if (isPlainObject(input)) {
    const rawRows = input.rows;
    if (rawRows !== undefined && !Array.isArray(rawRows)) {
      throw new TableError(`"rows" must be an array, got ${describe(rawRows)}.`);
    }
    const rawHeaders = input.headers;
    if (rawHeaders !== undefined && !Array.isArray(rawHeaders)) {
      throw new TableError(`"headers" must be an array, got ${describe(rawHeaders)}.`);
    }
    if (rawRows === undefined && rawHeaders === undefined) {
      throw new TableError("A table must have \"headers\" and \"rows\".");
    }
    let headers = (rawHeaders ?? []).map((h, i) => headerText(h, i));
    if (headers.length === 0) headers = declared.slice();
    if (headers.length === 0 && rawRows && rawRows.length > 0 && rawRows.every(isPlainObject)) {
      // No headers anywhere: the keys of the row objects become the columns.
      for (const row of rawRows) {
        for (const key of Object.keys(row)) if (!headers.includes(key)) headers.push(key);
      }
    }
    const rows = rowsFromObjects(headers, rawRows ?? []);
    return matrixFromRows(headers, rows);
  }

  throw new TableError(`A table must be { headers, rows } or a list of objects, got ${describe(input)}.`);
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function rowLine(cells: string[], widths: number[]): string {
  return "| " + cells.map((cell, i) => padToWidth(cell, widths[i] ?? 0)).join(" | ") + " |";
}

/** Renders a matrix with aligned columns, left-aligned (`| :--- |`). */
export function renderMarkdownTable(matrix: TableMatrix): string {
  const headers = matrix.headers.map((h) => escapeCell(h));
  if (headers.length === 0) return "";
  const rows = matrix.rows.map((row) => headers.map((_, i) => escapeCell(row[i])));
  const widths = headers.map((h, i) =>
    Math.max(MIN_COLUMN_WIDTH, displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ""))),
  );
  const separator = "| " + widths.map((w) => ":" + "-".repeat(w - 1)).join(" | ") + " |";
  return [rowLine(headers, widths), separator, ...rows.map((r) => rowLine(r, widths))].join("\n");
}

/** Normalizes the input and renders it as an aligned Markdown table. */
export function formatMarkdownTable(input: unknown, options: TableOptions = {}): string {
  return renderMarkdownTable(normalizeTable(input, options));
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

/** Escapes the three characters Telegram HTML requires. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainCell(value: unknown): string {
  return cellToString(value).replace(/\r\n|\r|\n/g, " ");
}

/** Renders a matrix as a monospace `<pre>` block (HTML-escaped) for Telegram. */
export function renderTelegramTable(matrix: TableMatrix): string {
  const headers = matrix.headers.map(plainCell);
  if (headers.length === 0) return "";
  const rows = matrix.rows.map((row) => headers.map((_, i) => plainCell(row[i])));
  const widths = headers.map((h, i) => Math.max(1, displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ""))));
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) => padToWidth(cell, widths[i] ?? 0))
      .join(" | ")
      .trimEnd();
  const separator = widths.map((w) => "-".repeat(w)).join(" | ");
  const text = [line(headers), separator, ...rows.map(line)].join("\n");
  return `<pre>${escapeTelegramHtml(text)}</pre>`;
}

/** Normalizes the input and renders it as a Telegram `<pre>` block. */
export function formatTelegramTable(input: unknown, options: TableOptions = {}): string {
  return renderTelegramTable(normalizeTable(input, options));
}
