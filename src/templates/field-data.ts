// Validation and normalization of the `data` an agent sends for a template (plan section 7.3).
// Every problem is collected, so the agent can fix all of them in one round trip.
import { DateError, formatDateValue } from "../engine/clock";
import { TableError, normalizeTable } from "../engine/table-formatter";
import type { FieldSpec } from "../types/template-types";

export interface DataCheck {
  /** Normalized data, ready for rendering (images are still raw: the attachment service resolves them). */
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface DataCheckOptions {
  /** Returns an error text when an image input has an unusable shape. */
  checkImage?: (value: unknown) => string | undefined;
  now?: () => Date;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

function isMissing(spec: FieldSpec, value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return (spec.type === "string" || spec.type === "date" || spec.type === "image") && value === "";
}

/** Coerces one value to the field type. Returns the value or throws an Error with the reason. */
function coerce(spec: FieldSpec, value: unknown, options: DataCheckOptions, warnings: string[]): unknown {
  switch (spec.type) {
    case "string":
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      throw new Error(`must be text, got ${describe(value)}`);
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
      throw new Error(`must be a number, got ${typeof value === "string" ? `"${value}"` : describe(value)}`);
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      throw new Error(`must be true or false, got ${typeof value === "string" ? `"${value}"` : describe(value)}`);
    }
    case "date": {
      try {
        formatDateValue(value, "YYYY-MM-DD", (options.now ?? (() => new Date()))());
      } catch (err) {
        throw new Error(err instanceof DateError ? err.message : "must be a date");
      }
      return value;
    }
    case "table": {
      try {
        const matrix = normalizeTable(value, { columns: spec.columns });
        if (spec.columns && spec.columns.length > 0 && matrix.rows.length > 0) {
          const missing = spec.columns.filter((c) => !matrix.headers.includes(c));
          if (missing.length > 0) {
            warnings.push(
              `Field "${spec.name}": the table has the columns [${matrix.headers.join(", ")}] but the template declares [${spec.columns.join(", ")}] (missing: ${missing.join(", ")}).`,
            );
          }
        }
        return { headers: matrix.headers, rows: matrix.rows };
      } catch (err) {
        if (err instanceof TableError) throw new Error(err.message);
        throw err;
      }
    }
    case "image": {
      const problem = options.checkImage?.(value);
      if (problem) throw new Error(problem);
      return value;
    }
    case "list": {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return [value];
      throw new Error(`must be a list, got ${describe(value)}`);
    }
    case "object": {
      if (isPlainObject(value)) return value;
      throw new Error(`must be an object, got ${describe(value)}`);
    }
  }
}

/**
 * Checks `raw` against the declared fields: required fields, types (with light coercion such as
 * "3" to 3), defaults and table normalization. Keys that are not declared pass through with a warning.
 */
export function validateData(fields: readonly FieldSpec[], raw: unknown, options: DataCheckOptions = {}): DataCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Record<string, unknown> = {};

  if (!isPlainObject(raw)) {
    return { data, errors: [`"data" must be a JSON object with the template fields, got ${describe(raw)}.`], warnings };
  }

  for (const spec of fields) {
    let value = Object.prototype.hasOwnProperty.call(raw, spec.name) ? raw[spec.name] : undefined;
    if (isMissing(spec, value) && spec.default !== undefined) value = spec.default;
    if (isMissing(spec, value)) {
      if (spec.required) {
        errors.push(`Field "${spec.name}" (${spec.type}) is required${spec.description ? `: ${spec.description}` : "."}`);
      }
      continue;
    }
    try {
      data[spec.name] = coerce(spec, value, options, warnings);
    } catch (err) {
      errors.push(`Field "${spec.name}" (${spec.type}): ${err instanceof Error ? err.message : String(err)}.`);
    }
  }

  const declared = new Set(fields.map((f) => f.name));
  for (const key of Object.keys(raw)) {
    if (declared.has(key)) continue;
    if (FORBIDDEN_KEYS.has(key)) {
      warnings.push(`Field "${key}" was ignored.`);
      continue;
    }
    warnings.push(`Field "${key}" is not declared in the template; it was passed as is.`);
    data[key] = raw[key];
  }
  return { data, errors, warnings };
}
