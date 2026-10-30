import { isAbsolute, relative, resolve, sep } from "node:path";

/** Resolve one Program-relative source inside the staged render project. */
export function resolveStagedPath(root: string, source: string): string | undefined {
  const base = resolve(root);
  const path = resolve(base, source);
  const local = relative(base, path);
  return local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local) ? undefined : path;
}
