import { TableError, formatMarkdownTable, formatTelegramTable } from "../table-formatter";
import { SafeHtml } from "../image-value";
import { FilterError, type FilterRegistrar } from "./types";

/**
 * `{{ tarefas | markdown_table }}` renders a table field: aligned Markdown in the Obsidian
 * channel, a monospace block in the Telegram channel. Extra arguments are column names:
 * `{{ tarefas | markdown_table: "Ticket", "Status" }}` fixes the column order of a list of objects.
 */
export const registerTableFilters: FilterRegistrar = (engine, env) => {
  engine.registerFilter("markdown_table", function (value: unknown, ...columns: unknown[]) {
    const names = columns.map((c) => String(c));
    try {
      if (env.channel === "telegram") return new SafeHtml(formatTelegramTable(value, { columns: names }));
      return formatMarkdownTable(value, { columns: names });
    } catch (err) {
      if (err instanceof TableError) throw new FilterError("markdown_table", err.message);
      throw err;
    }
  });
};
