import { realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type { ProjectMediaResourceResolver } from "@hypit/media-asset/service";

export function createNodeProjectResourceResolver(root: string): ProjectMediaResourceResolver {
  const boundary = resolve(root);
  return async (path, mediaType) => {
    const canonical = await realpath(path);
    const local = relative(boundary, canonical);
    if (local === "" || local === ".." || local.startsWith(`..${sep}`)) {
      throw new Error(`Media resource ${path} leaves the Project Boundary.`);
    }
    const information = await stat(canonical);
    if (!information.isFile()) throw new Error(`Media resource ${path} is not a file.`);
    return { address: canonical, mediaType, size: information.size };
  };
}
