import type { Liquid } from "liquidjs";
import type { RenderChannel } from "../../types/template-types";

/** What the filters need from the engine that registers them. */
export interface FilterEnv {
  channel: RenderChannel;
  now: () => Date;
  /** True when images must be written as classic Markdown links instead of wikilink embeds. */
  classicMarkdownLinks: () => boolean;
}

export type FilterRegistrar = (engine: Liquid, env: FilterEnv) => void;

/** A Liquid error raised from a filter: the message names the filter so the agent can fix the input. */
export class FilterError extends Error {
  constructor(filter: string, message: string) {
    super(`${filter}: ${message}`);
    this.name = "FilterError";
  }
}
