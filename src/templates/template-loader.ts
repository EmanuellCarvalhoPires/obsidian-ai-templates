// Finds the template notes in the templates folder, parses and checks them, and caches the
// result until the vault changes (the plugin calls invalidate() on vault and metadata events).
import { normalizePath } from "obsidian";
import type { TemplateEngine } from "../engine/template-engine";
import { TemplateNotFoundError, errorMessage } from "../errors";
import type { VaultPort } from "../storage/vault-port";
import type { TemplateDefinition, TemplateProblem, TemplateSummary } from "../types/template-types";
import { parseTemplateNote } from "./template-parser";
import { checkDefinition } from "./template-validator";

export interface LoadResult {
  templates: TemplateDefinition[];
  problems: TemplateProblem[];
}

export interface LoaderDeps {
  vault: VaultPort;
  engine: TemplateEngine;
  getFolder: () => string;
}

export class TemplateLoader {
  private cache: Promise<LoadResult> | undefined;
  private last: LoadResult | undefined;
  private readonly listeners = new Set<(result: LoadResult) => void>();

  constructor(private readonly deps: LoaderDeps) {}

  /** Forgets the cached result: the next call reads the notes again. */
  invalidate(): void {
    this.cache = undefined;
  }

  /** The most recent result, without reading anything (undefined before the first load). */
  lastResult(): LoadResult | undefined {
    return this.last;
  }

  /** Called after each load. Returns an unsubscribe function. */
  onLoaded(listener: (result: LoadResult) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load(): Promise<LoadResult> {
    if (!this.cache) {
      const run = this.read();
      this.cache = run;
      run.then(
        (result) => {
          // Ignore results of a load that was invalidated while it ran.
          if (this.cache !== run) return;
          this.last = result;
          for (const listener of this.listeners) listener(result);
        },
        () => undefined,
      );
    }
    return this.cache;
  }

  async list(): Promise<TemplateSummary[]> {
    const { templates } = await this.load();
    return templates.map((t) => ({ id: t.id, description: t.description }));
  }

  async find(id: string): Promise<TemplateDefinition | undefined> {
    const { templates } = await this.load();
    return templates.find((t) => t.id === id);
  }

  /** Like find, but throws a TemplateNotFoundError that lists the available ids. */
  async require(id: unknown): Promise<TemplateDefinition> {
    const wanted = typeof id === "string" ? id.trim() : "";
    const { templates } = await this.load();
    const found = templates.find((t) => t.id === wanted);
    if (!found) throw new TemplateNotFoundError(wanted, templates.map((t) => t.id));
    return found;
  }

  private async read(): Promise<LoadResult> {
    const { vault, engine } = this.deps;
    const folder = normalizePath(this.deps.getFolder().trim());
    const templates: TemplateDefinition[] = [];
    const problems: TemplateProblem[] = [];
    const seen = new Map<string, string>();

    for (const path of vault.listMarkdown(folder === "/" ? "" : folder)) {
      let content: string;
      try {
        content = await vault.readText(path);
      } catch (err) {
        problems.push({ level: "error", path, message: `Could not read the note: ${errorMessage(err)}` });
        continue;
      }
      const parsed = parseTemplateNote(path, content);
      problems.push(...parsed.problems);
      const def = parsed.definition;
      if (!def) continue;

      const firstPath = seen.get(def.id);
      if (firstPath !== undefined) {
        problems.push({
          level: "warning",
          path,
          templateId: def.id,
          message: `The template_id "${def.id}" is already used by "${firstPath}". This note is ignored.`,
        });
        continue;
      }

      const check = checkDefinition(def, engine, { strictDeclared: false, configDir: vault.configDir });
      for (const message of check.errors) problems.push({ level: "error", path, templateId: def.id, message });
      if (check.errors.length > 0) continue;
      for (const message of check.warnings) problems.push({ level: "warning", path, templateId: def.id, message });

      seen.set(def.id, path);
      templates.push(def);
    }
    return { templates, problems };
  }
}
