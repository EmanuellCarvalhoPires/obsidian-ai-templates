// Checks a template definition: the body and target_path must parse, and every variable they
// read must be declared in `fields` (or be a built-in). Used when notes are loaded (problems are
// warnings, the template still works) and by create_template (problems are errors).
import { BUILTIN_VARIABLES } from "../engine/template-engine";
import type { TemplateEngine } from "../engine/template-engine";
import { PathError } from "../errors";
import { checkVaultPath } from "../storage/path-guard";
import type { TemplateDefinition } from "../types/template-types";

export interface DefinitionCheck {
  errors: string[];
  warnings: string[];
  /** Variables the body and target_path read. */
  variables: string[];
}

export interface DefinitionCheckOptions {
  /** True for create_template: an undeclared variable is an error, not a warning. */
  strictDeclared: boolean;
  configDir: string;
}

const HAS_LIQUID = /\{\{|\{%/;

export function checkDefinition(def: TemplateDefinition, engine: TemplateEngine, options: DefinitionCheckOptions): DefinitionCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const used = new Set<string>();

  const body = engine.validate(def.body);
  if (body.ok) body.variables.forEach((v) => used.add(v));
  else errors.push(`The template body does not compile: ${body.error.message}`);

  for (const [label, text] of [
    ["append_block", def.appendBlock],
    ["index_block", def.indexBlock],
  ] as const) {
    if (text === undefined) continue;
    const block = engine.validate(text);
    if (block.ok) block.variables.forEach((v) => used.add(v));
    else errors.push(`${label} does not compile: ${block.error.message}`);
  }

  if (def.targetPath !== undefined) {
    const target = engine.validate(def.targetPath);
    if (target.ok) target.variables.forEach((v) => used.add(v));
    else errors.push(`target_path does not compile: ${target.error.message}`);
    // A fixed path can be checked now; a path with expressions is checked when it is rendered.
    if (!HAS_LIQUID.test(def.targetPath)) {
      try {
        checkVaultPath(def.targetPath, { configDir: options.configDir, label: "target_path" });
      } catch (err) {
        if (err instanceof PathError) errors.push(err.message);
        else throw err;
      }
    }
  }

  const declared = new Set(def.fields.map((f) => f.name));
  const builtins = new Set(BUILTIN_VARIABLES);
  for (const name of used) {
    if (declared.has(name) || builtins.has(name)) continue;
    const message = `The template reads "${name}" but no field with that name is declared in "fields". Declare it, or fix the name.`;
    (options.strictDeclared ? errors : warnings).push(message);
  }
  for (const spec of def.fields) {
    if (!used.has(spec.name)) warnings.push(`Field "${spec.name}" is declared but the template never uses it.`);
  }
  return { errors, warnings, variables: Array.from(used) };
}
