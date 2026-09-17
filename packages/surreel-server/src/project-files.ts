import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Service writes must not follow paths an earlier agent run replaced with links. */
export async function ensureProjectDirectory(workspace: string, requested: string): Promise<string> {
  const root = resolve(workspace);
  if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) throw new Error("The project workspace cannot contain symbolic links in its location.");
  const destination = resolve(requested);
  const suffix = relative(root, destination);
  if (isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) throw new Error("The requested directory is outside this project.");
  let directory = root;
  for (const part of suffix.split(sep).filter(Boolean)) {
    directory = join(directory, part);
    try { await mkdir(directory, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("A project service directory was replaced by a file or symbolic link.");
  }
  return destination;
}
