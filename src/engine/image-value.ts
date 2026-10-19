import type { ResolvedImage } from "../types/template-types";

/**
 * An image field after the attachment service saved (or found) the file. It prints as a
 * plain embed when used without a filter; `obsidian_image` gives control over width and link style.
 */
export class ImageValue implements ResolvedImage {
  constructor(
    public readonly vaultPath: string,
    public readonly linkText: string,
  ) {}

  toString(): string {
    return `![[${this.linkText}]]`;
  }
}

export function isImageValue(value: unknown): value is ImageValue {
  return value instanceof ImageValue;
}

/** Marks text that already is valid Telegram HTML: the channel escape leaves it alone. */
export class SafeHtml {
  constructor(public readonly html: string) {}
  toString(): string {
    return this.html;
  }
}
