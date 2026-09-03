import { stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

async function nearestProjectPackageRoot(start: string): Promise<string | undefined> {
  let directory = resolve(start);
  while (true) {
    const candidate = resolve(directory, "package.json");
    try {
      if ((await stat(candidate)).isFile()) return directory;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/**
 * Resolve the project before any Runtime selection is considered.
 *
 * An explicit Workspace is already the boundary. Otherwise the nearest
 * package.json declares the boundary; when none exists, cwd itself is the
 * explicit shell context. Source paths and Runtime state never choose it.
 */
export async function resolveProjectRoot(options: {
  readonly workspaceRoot?: string;
  readonly cwd?: string;
} = {}): Promise<string> {
  const start = resolve(options.workspaceRoot ?? options.cwd ?? process.cwd());
  if (options.workspaceRoot !== undefined) return start;
  return await nearestProjectPackageRoot(start) ?? start;
}

/** Project package discovery cannot escape an already resolved project. */
export async function resolvePackageRoot(projectRoot: string): Promise<string> {
  return resolve(projectRoot);
}
