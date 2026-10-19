// Date helpers on top of the moment that Obsidian ships (window.moment). Nothing else in the
// plugin touches moment, so tests can replace it by setting globalThis.moment.

interface MomentLike {
  format(format?: string): string;
  isValid(): boolean;
}

export type MomentFactory = (input?: unknown, format?: string | string[], strict?: boolean) => MomentLike;

export interface MomentStatics {
  ISO_8601: string;
}

/** The moment function of the host, or undefined when it is not available. */
export function getMoment(): (MomentFactory & Partial<MomentStatics>) | undefined {
  const candidate = (globalThis as { moment?: unknown }).moment;
  return typeof candidate === "function" ? (candidate as MomentFactory & Partial<MomentStatics>) : undefined;
}

export class DateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateError";
  }
}

const pad = (n: number, size = 2): string => String(n).padStart(size, "0");

/** Fallback when moment is missing (tests without it): supports YYYY MM DD HH mm ss only. */
function basicFormat(date: Date, format: string): string {
  return format
    .replace(/YYYY/g, pad(date.getFullYear(), 4))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()));
}

/** Formats a Date with a moment format string. */
export function formatDate(date: Date, format: string): string {
  const moment = getMoment();
  if (!moment) return basicFormat(date, format);
  return moment(date).format(format);
}

/**
 * Reads a value as a date and formats it. Accepts Date, epoch milliseconds, the word "now",
 * ISO 8601 text, or text in `inputFormat`. Throws DateError with an actionable message.
 */
export function formatDateValue(value: unknown, format: string, now: Date, inputFormat?: string): string {
  const moment = getMoment();
  if (value === undefined || value === null || value === "" || value === "now") return formatDate(now, format);

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new DateError("the date is invalid");
    return formatDate(value, format);
  }
  if (typeof value === "number") return formatDate(new Date(value), format);
  if (typeof value !== "string") throw new DateError(`cannot read a ${typeof value} as a date`);

  if (moment) {
    const parsed = inputFormat ? moment(value, inputFormat, true) : moment(value, moment.ISO_8601 ?? "YYYY-MM-DD", true);
    if (parsed.isValid()) return parsed.format(format);
    throw new DateError(
      inputFormat
        ? `"${value}" does not match the input format "${inputFormat}"`
        : `cannot read "${value}" as a date; use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm) or pass the input format as the second argument`,
    );
  }
  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) throw new DateError(`cannot read "${value}" as a date`);
  return formatDate(fallback, format);
}

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
