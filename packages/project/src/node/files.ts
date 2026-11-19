import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { assertProjectRelativePath } from "../document-registry.js";

/** Address of a file on the Node host, with a portable identity inside one canonical Project root. */
export type NodeProjectFile = { readonly path: string; readonly address: string };

function within(root: string, address: string, label: string): string {
  const local = relative(root, address);
  if (isAbsolute(local) || local === ".." || local.startsWith(`..${sep}`)) {
    throw new Error(`${label} leaves the Project Boundary.`);
  }
  return local.split(sep).join("/");
}

function missing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export async function resolveNodeProjectFile(root: string, path: string, label = "Project file"): Promise<NodeProjectFile> {
  assertProjectRelativePath(path, label);
  const address = await realpath(resolve(root, path));
  const canonical = within(root, address, label);
  if (!(await stat(address)).isFile()) throw new Error(`${label} ${path} is not a regular file.`);
  return { path: canonical, address };
}

/** Resolve an output whose leaf may be new, checking each directory before creating descendants. */
export async function prepareNodeProjectFile(root: string, path: string, options: {
  readonly label?: string;
  readonly createDirectories?: boolean;
} = {}): Promise<NodeProjectFile> {
  const label = options.label ?? "Project file";
  assertProjectRelativePath(path, label);
  const target = resolve(root, path);
  let parent: string;
  if (options.createDirectories) {
    parent = root;
    for (const part of path.split("/").slice(0, -1)) {
      const directory = resolve(parent, part);
      await mkdir(directory).catch(error => {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      });
      parent = await realpath(directory);
      within(root, parent, label);
      if (!(await stat(parent)).isDirectory()) throw new Error(`${label} requires a directory at ${part}.`);
    }
  } else {
    parent = await realpath(dirname(target));
    within(root, parent, label);
  }
  const address = resolve(parent, path.split("/").at(-1)!);
  const canonical = within(root, address, label);
  const exists = await lstat(address).then(() => true, error => {
    if (missing(error)) return false;
    throw error;
  });
  return exists ? await resolveNodeProjectFile(root, canonical, label) : { path: canonical, address };
}
