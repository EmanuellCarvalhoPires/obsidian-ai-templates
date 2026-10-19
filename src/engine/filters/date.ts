import { DEFAULT_DATE_FORMAT, DateError, formatDate, formatDateValue } from "../clock";
import { FilterError, type FilterRegistrar } from "./types";

/**
 * `{{ "now" | date_fmt: "DD/MM/YYYY HH:mm" }}` and `{{ prazo | date_fmt: "DD/MM", "YYYY-MM-DD" }}`
 * (second argument: input format). Formats are moment formats. The `now` tag does the same for
 * the current time: `{% now "DD/MM/YYYY" %}`.
 */
export const registerDateFilters: FilterRegistrar = (engine, env) => {
  engine.registerFilter("date_fmt", function (value: unknown, format?: unknown, inputFormat?: unknown) {
    const out = typeof format === "string" && format !== "" ? format : DEFAULT_DATE_FORMAT;
    const input = typeof inputFormat === "string" && inputFormat !== "" ? inputFormat : undefined;
    try {
      return formatDateValue(value, out, env.now(), input);
    } catch (err) {
      if (err instanceof DateError) throw new FilterError("date_fmt", err.message);
      throw err;
    }
  });

  engine.registerTag("now", {
    parse(token) {
      this.format = token.args.trim();
    },
    *render(ctx, emitter) {
      let format = DEFAULT_DATE_FORMAT;
      const rawFormat = typeof this.format === "string" ? this.format : "";
      if (rawFormat !== "") {
        const evaluated: unknown = yield this.liquid.evalValue(rawFormat, ctx);
        if (typeof evaluated === "string" && evaluated !== "") format = evaluated;
      }
      emitter.write(formatDate(env.now(), format));
    },
  });
};
