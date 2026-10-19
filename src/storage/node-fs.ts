// The real disk, for local images. Desktop only (the manifest says isDesktopOnly).
import { promises as fsp } from "node:fs";
import * as os from "node:os";
import type { FsPort } from "./path-guard";

export function createNodeFs(): FsPort {
  return {
    realpath: (path) => fsp.realpath(path),
    stat: async (path) => {
      const stat = await fsp.stat(path);
      return { isFile: stat.isFile(), size: stat.size };
    },
    readFile: async (path) => new Uint8Array(await fsp.readFile(path)),
    tmpdir: () => os.tmpdir(),
  };
}
