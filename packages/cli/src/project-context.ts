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

/** Resolve package discovery independently from project-owned Result storage. */
export async function resolvePackageRoot(projectStart: string): Promise<string> {
  return await nearestProjectPackageRoot(projectStart) ?? resolve(projectStart);
}
