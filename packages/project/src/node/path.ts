import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function projectMember(projectRoot: string, path: string, label: string): string {
  const root = resolve(projectRoot);
  const target = resolve(path);
  const local = relative(root, target);
  if (local === "" || local === ".." || local.startsWith(`..${sep}`)
    || isAbsolute(local) || resolve(root, local) !== target) {
    throw new Error(`${label} ${target} leaves the application Project Root ${root}.`);
  }
  return target;
}

export function projectReference(
  projectRoot: string,
  ownerFile: string,
  path: string,
  label: string,
): string {
  return projectMember(projectRoot, resolve(dirname(ownerFile), path), label);
}

export function portableRelative(from: string, target: string): string {
  const path = relative(resolve(from), resolve(target)).split(sep).join("/");
  if (path.length === 0) throw new Error(`Cannot create a relative reference from ${from} to itself.`);
  return path;
}
