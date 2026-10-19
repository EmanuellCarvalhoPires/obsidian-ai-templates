import { describe, expect, it } from "vitest";
import {
  TableError,
  cellToString,
  displayWidth,
  escapeCell,
  escapeTelegramHtml,
  formatMarkdownTable,
  formatTelegramTable,
  normalizeTable,
  padToWidth,
  renderMarkdownTable,
  renderTelegramTable,
} from "../../src/engine/table-formatter";

describe("table-formatter", () => {
  describe("cellToString and escapeCell", () => {
    it("turns null and undefined into empty cells", () => {
      expect(cellToString(null)).toBe("");
      expect(cellToString(undefined)).toBe("");
      expect(escapeCell(null)).toBe("");
      expect(escapeCell(undefined)).toBe("");
    });

    it("formats primitives, dates, and objects", () => {
      expect(cellToString("hello")).toBe("hello");
      expect(cellToString(42)).toBe("42");
      expect(cellToString(true)).toBe("true");
      expect(cellToString(10n)).toBe("10");
      expect(cellToString(new Date("2026-10-19T12:00:00.000Z"))).toBe("2026-10-19T12:00:00.000Z");
      expect(cellToString(new Date("invalid"))).toBe("");
      expect(cellToString({ a: 1 })).toBe('{"a":1}');
    });

    it("escapes pipes and replaces line breaks with <br>", () => {
      expect(escapeCell("a | b | c")).toBe("a \\| b \\| c");
      expect(escapeCell("line 1\nline 2\r\nline 3\rline 4")).toBe("line 1<br>line 2<br>line 3<br>line 4");
      expect(escapeCell("cmd | grep foo\nnext | line")).toBe("cmd \\| grep foo<br>next \\| line");
    });
  });

  describe("displayWidth and padToWidth", () => {
    it("counts combining marks as 0, ASCII/accented as 1, and CJK/emoji as 2", () => {
      expect(displayWidth("abc")).toBe(3);
      // "a" + combining acute accent
      expect(displayWidth("a\u0301")).toBe(1);
      expect(displayWidth("ação")).toBe(4);
      expect(displayWidth("日本語")).toBe(6);
      expect(displayWidth("🚀")).toBe(2);
      expect(padToWidth("oi", 5)).toBe("oi   ");
      expect(padToWidth("🚀", 4)).toBe("🚀  ");
    });
  });

  describe("normalizeTable", () => {
    it("normalizes { headers, rows } matrix input and pads short/long rows", () => {
      const matrix = normalizeTable({
        headers: ["Key", "Summary"],
        rows: [
          ["ATL-1", "First issue"],
          ["ATL-2"],
          ["ATL-3", "Third", "Extra cell"],
        ],
      });
      expect(matrix).toEqual({
        headers: ["Key", "Summary", "Column 3"],
        rows: [
          ["ATL-1", "First issue", ""],
          ["ATL-2", "", ""],
          ["ATL-3", "Third", "Extra cell"],
        ],
      });
    });

    it("converts a list of objects into a matrix using union of keys", () => {
      const matrix = normalizeTable([
        { ticket: "ATL-1", status: "Done" },
        { ticket: "ATL-2", owner: "Ana" },
      ]);
      expect(matrix).toEqual({
        headers: ["ticket", "status", "owner"],
        rows: [
          ["ATL-1", "Done", undefined],
          ["ATL-2", undefined, "Ana"],
        ],
      });
    });

    it("respects declared columns order and appends extra object keys after", () => {
      const matrix = normalizeTable(
        [
          { extra: "X", status: "Open", ticket: "ATL-10" },
          { ticket: "ATL-11", status: "Closed", extra: "Y" },
        ],
        { columns: ["ticket", "status"] },
      );
      expect(matrix).toEqual({
        headers: ["ticket", "status", "extra"],
        rows: [
          ["ATL-10", "Open", "X"],
          ["ATL-11", "Closed", "Y"],
        ],
      });
    });

    it("accepts array of row arrays when columns are declared", () => {
      const matrix = normalizeTable(
        [
          ["ATL-1", "Open"],
          ["ATL-2", "Done"],
        ],
        { columns: ["Ticket", "Status"] },
      );
      expect(matrix).toEqual({
        headers: ["Ticket", "Status"],
        rows: [
          ["ATL-1", "Open"],
          ["ATL-2", "Done"],
        ],
      });
    });

    it("accepts { rows } of objects without headers and infers headers", () => {
      const matrix = normalizeTable({
        rows: [{ a: 1, b: 2 }],
      });
      expect(matrix).toEqual({
        headers: ["a", "b"],
        rows: [[1, 2]],
      });
    });

    it("throws TableError on invalid shapes", () => {
      expect(() => normalizeTable("not a table")).toThrow(TableError);
      expect(() => normalizeTable(123)).toThrow(TableError);
      expect(() => normalizeTable({})).toThrow(TableError);
      expect(() => normalizeTable({ headers: "bad", rows: [] })).toThrow(TableError);
      expect(() => normalizeTable({ headers: [], rows: "bad" })).toThrow(TableError);
      expect(() => normalizeTable([1, 2, 3])).toThrow(TableError);
      expect(() => normalizeTable({ headers: ["A"], rows: ["bad row"] })).toThrow(TableError);
    });
  });

  describe("formatMarkdownTable and renderMarkdownTable", () => {
    it("renders deterministic aligned columns with escaped pipes, <br>, and empty null/undefined cells", () => {
      const md = formatMarkdownTable({
        headers: ["ID", "Description", "Notes"],
        rows: [
          ["1", "Simple", null],
          ["2", "Has | pipe\nand newline", undefined],
        ],
      });

      const lines = md.split("\n");
      expect(lines).toEqual([
        "| ID  | Description                | Notes |",
        "| :-- | :------------------------- | :---- |",
        "| 1   | Simple                     |       |",
        "| 2   | Has \\| pipe<br>and newline |       |",
      ]);
    });

    it("returns empty string when headers are empty", () => {
      expect(renderMarkdownTable({ headers: [], rows: [] })).toBe("");
    });
  });

  describe("formatTelegramTable and renderTelegramTable", () => {
    it("renders a <pre> block with HTML escaping for <, >, & and replaces newlines with spaces", () => {
      expect(escapeTelegramHtml("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");

      const html = formatTelegramTable({
        headers: ["Tag", "Expr"],
        rows: [
          ["<b>", "x < 10 & y > 5\nnext"],
          [null, undefined],
        ],
      });

      expect(html).toBe(
        "<pre>" +
          [
            "Tag | Expr",
            "--- | -------------------",
            "&lt;b&gt; | x &lt; 10 &amp; y &gt; 5 next",
            "    |",
          ].join("\n") +
          "</pre>",
      );
    });

    it("returns empty string when matrix has no headers", () => {
      expect(renderTelegramTable({ headers: [], rows: [] })).toBe("");
    });
  });
});
