// Writes notes: creates the folders, applies the collision rule.
import { UserError, errorMessage } from "../errors";
import type { CollisionRule } from "../types/template-types";
import type { VaultPort } from "./vault-port";

const MAX_INCREMENT = 1000;

export interface NotePlan {
  /** The path that was asked for, before the collision rule. */
  requested: string;
  /** Final vault path. */
  path: string;
  /** True when the note already exists and will be replaced (rule "overwrite"). */
  overwrite: boolean;
  /** True when the path differs from the requested one (rule "incremental"). */
  renamed: boolean;
}

function split(path: string): { dir: string; base: string; ext: string } {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? { dir, base: name, ext: "" } : { dir, base: name.slice(0, dot), ext: name.slice(dot) };
}

export class NoteCreator {
  constructor(private readonly vault: VaultPort) {}

  /** Decides the final path under the collision rule. Does not write anything. */
  plan(requested: string, rule: CollisionRule): NotePlan {
    const existing = this.vault.kind(requested);
    if (existing === "folder") {
      throw new UserError(`"${requested}" is a folder. Choose a file path for the note.`, "conflict");
    }
    if (existing === undefined) return { requested, path: requested, overwrite: false, renamed: false };

    if (rule === "error") {
      throw new UserError(
        `A note already exists at "${requested}" and the collision rule is "error". ` +
          `Choose another target_path or change the template's collision_rule to "incremental" or "overwrite".`,
        "conflict",
      );
    }
    if (rule === "overwrite") return { requested, path: requested, overwrite: true, renamed: false };

    const { dir, base, ext } = split(requested);
    for (let n = 1; n <= MAX_INCREMENT; n++) {
      const candidate = `${dir === "" ? "" : `${dir}/`}${base} ${n}${ext}`;
      if (this.vault.kind(candidate) === undefined) return { requested, path: candidate, overwrite: false, renamed: true };
    }
    throw new UserError(`Could not find a free name for "${requested}" after ${MAX_INCREMENT} tries.`, "conflict");
  }

  /** Creates the missing folders of a vault directory path. */
  async ensureFolder(dir: string): Promise<void> {
    if (dir === "") return;
    let current = "";
    for (const segment of dir.split("/")) {
      current = current === "" ? segment : `${current}/${segment}`;
      const kind = this.vault.kind(current);
      if (kind === "folder") continue;
      if (kind === "file") {
        throw new UserError(`"${current}" is a file, so the folder "${dir}" cannot be created.`, "conflict");
      }
      try {
        await this.vault.createFolder(current);
      } catch (err) {
        if (this.vault.kind(current) !== "folder") {
          throw new UserError(`Could not create the folder "${current}": ${errorMessage(err)}`, "conflict");
        }
      }
    }
  }

  /**
   * Writes the note at the planned path. When another note took the path in the meantime and the
   * rule is "incremental", the next free name is used. Returns the path that was written.
   */
  async write(plan: NotePlan, content: string, rule: CollisionRule): Promise<NotePlan> {
    await this.ensureFolder(split(plan.path).dir);
    if (plan.overwrite) {
      await this.vault.writeText(plan.path, content);
      return plan;
    }
    let current = plan;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.vault.createText(current.path, content);
        return current;
      } catch (err) {
        if (rule !== "incremental" || this.vault.kind(current.path) === undefined) {
          throw new UserError(`Could not create "${current.path}": ${errorMessage(err)}`, "conflict");
        }
        current = this.plan(plan.requested, "incremental");
      }
    }
    throw new UserError(`Could not create "${plan.path}": the path keeps being taken.`, "conflict");
  }
}
