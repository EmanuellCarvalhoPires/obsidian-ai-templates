// Pure text operations behind the write modes "append" and "upsert_section": add a block to the end
// of a note, insert a line under a heading, replace what is under a heading. They know nothing about
// the vault; NoteCreator applies them inside vault.process, so the read and the write are atomic.
import { splitFrontmatter } from "../templates/template-parser";

export interface MergeResult {
  text: string;
  warnings: string[];
}

interface HeadingRef {
  /** Index of the heading line. */
  line: number;
  level: number;
}

const HEADING_LINE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;

/** "## Sumário" gives level 2 and text "Sumário"; plain "Sumário" has no level (any level matches). */
export function parseHeadingQuery(query: string): { level?: number; text: string } {
  const trimmed = query.trim();
  const match = /^(#{1,6})[ \t]+(.+)$/.exec(trimmed);
  if (match) return { level: match[1].length, text: match[2].trim() };
  return { text: trimmed };
}

/** Number of lines the frontmatter takes at the top of the note (0 when there is none). */
function frontmatterLines(lines: string[]): number {
  if (!/^\uFEFF?---[ \t]*$/.test(lines[0] ?? "")) return 0;
  for (let i = 1; i < lines.length; i++) if (/^---[ \t]*$/.test(lines[i])) return i + 1;
  return 0;
}

/** Every heading of the note, skipping the frontmatter and fenced code blocks. */
function scanHeadings(lines: string[]): Array<HeadingRef & { text: string }> {
  const out: Array<HeadingRef & { text: string }> = [];
  let fence: string | undefined;
  for (let i = frontmatterLines(lines); i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE_LINE.exec(line);
    if (f) {
      const marker = f[1];
      if (fence === undefined) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (fence !== undefined) continue;
    const h = HEADING_LINE.exec(line);
    if (h) out.push({ line: i, level: h[1].length, text: h[2].trim() });
  }
  return out;
}

function findHeading(lines: string[], query: string): (HeadingRef & { end: number }) | undefined {
  const wanted = parseHeadingQuery(query);
  const headings = scanHeadings(lines);
  const index = headings.findIndex(
    (h) => h.text.toLowerCase() === wanted.text.toLowerCase() && (wanted.level === undefined || h.level === wanted.level),
  );
  if (index === -1) return undefined;
  const found = headings[index];
  // The section ends at the next heading of the same or a higher level.
  const next = headings.slice(index + 1).find((h) => h.level <= found.level);
  return { line: found.line, level: found.level, end: next ? next.line : lines.length };
}

function eolOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function toLines(text: string): string[] {
  return text.split(/\r\n|\n/);
}

/** The text to add, without frontmatter and without blank lines at the edges. */
export function cleanFragment(markdown: string): string {
  return splitFrontmatter(markdown.replace(/\r\n?/g, "\n")).body.replace(/^\n+/, "").replace(/\s+$/, "");
}

/** Adds `block` at the end of the note, after one blank line. */
export function appendToEnd(text: string, block: string): string {
  const eol = eolOf(text);
  const body = block.replace(/\n/g, eol);
  if (text.trim() === "") return `${body}${eol}`;
  return `${text.replace(/\s+$/, "")}${eol}${eol}${body}${eol}`;
}

/** Inserts `line` as the last line of the section under `heading`. */
export function insertUnderHeading(text: string, heading: string, line: string): MergeResult {
  const lines = toLines(text);
  const found = findHeading(lines, heading);
  if (!found) {
    return { text, warnings: [`The heading "${heading}" was not found in the note, so the index line was not inserted.`] };
  }
  let last = found.line;
  for (let i = found.line + 1; i < found.end; i++) if (lines[i].trim() !== "") last = i;
  const inserted = line.split("\n");
  lines.splice(last + 1, 0, ...inserted);
  return { text: lines.join(eolOf(text)), warnings: [] };
}

/**
 * Replaces what is under `section` with `content`, keeping the heading line. A section that does
 * not exist is added at the end of the note (with the heading). A first line of `content` that
 * repeats the heading is dropped.
 */
export function replaceSection(text: string, section: string, content: string): MergeResult {
  const lines = toLines(text);
  const found = findHeading(lines, section);
  const eol = eolOf(text);
  const query = parseHeadingQuery(section);
  const headingLine = (level: number, label: string): string => `${"#".repeat(level)} ${label}`;

  let body = content.split("\n");
  const first = body.findIndex((l) => l.trim() !== "");
  if (first !== -1) {
    const h = HEADING_LINE.exec(body[first]);
    if (h && h[2].trim().toLowerCase() === query.text.toLowerCase() && (query.level === undefined || h[1].length === query.level)) {
      body = body.slice(first + 1);
    }
  }
  const cleaned = body.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");

  if (!found) {
    const heading = headingLine(query.level ?? 2, query.text);
    const block = cleaned === "" ? heading : `${heading}\n\n${cleaned}`;
    return {
      text: appendToEnd(text, block),
      warnings: [`The section "${section}" was not found; it was added at the end of the note.`],
    };
  }
  const replacement = cleaned === "" ? [""] : ["", ...cleaned.split("\n"), ""];
  // A following heading needs a blank line before it; at the end of the note there is none to add.
  const atEnd = found.end >= lines.length;
  lines.splice(found.line + 1, found.end - found.line - 1, ...(atEnd ? replacement.slice(0, -1) : replacement));
  const result = lines.join(eol);
  return { text: atEnd && !result.endsWith(eol) ? `${result}${eol}` : result, warnings: [] };
}
