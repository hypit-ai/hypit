import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { buildResultDirectory, readBuildResult } from "@hypit/build-result";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, (error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  });
}

/** Move current-format Results from the former flat layout into their Build-id date buckets. */
export async function migrateFlatBuildResults(root: string): Promise<readonly string[]> {
  const directory = resolve(root);
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  const moves: Array<{ readonly build: string; readonly source: string; readonly destination: string }> = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    let destination: string;
    try {
      destination = buildResultDirectory(directory, entry.name);
    } catch {
      continue;
    }
    const source = join(directory, entry.name);
    assert(await readBuildResult(source) !== undefined,
      `${source} is named like a Build but has no Result manifest`);
    assert(!await exists(destination),
      `Build Result ${entry.name} already exists at ${destination}`);
    moves.push({ build: entry.name, source, destination });
  }
  for (const move of moves) {
    await mkdir(dirname(move.destination), { recursive: true });
    await rename(move.source, move.destination);
  }
  return moves.map((move) => move.build);
}
