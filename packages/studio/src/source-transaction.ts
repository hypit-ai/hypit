import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type SourceFileOperations = {
  readonly read: (path: string) => Promise<string>;
  readonly write: (path: string, text: string) => Promise<void>;
  readonly move: (from: string, to: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
};

const nodeSourceFileOperations: SourceFileOperations = {
  read: async (path) => await readFile(path, "utf8"),
  write: async (path, text) => { await writeFile(path, text, "utf8"); },
  move: async (from, to) => { await rename(from, to); },
  remove: async (path) => { await unlink(path); },
};

/** Publish a set of complete Source texts, restoring already-published files on write failure. */
export async function replaceSourceFiles(
  files: ReadonlyMap<string, string>,
  operations: SourceFileOperations = nodeSourceFileOperations,
): Promise<void> {
  const temporaries: { readonly path: string; readonly temporary: string }[] = [];
  const previous = new Map<string, string>();
  const applied: string[] = [];
  try {
    for (const [absolute, text] of files) {
      previous.set(absolute, await operations.read(absolute));
      const temporary = join(dirname(absolute), `.${basename(absolute)}.hypit-studio.tmp`);
      await operations.write(temporary, text);
      temporaries.push({ path: absolute, temporary });
    }
    for (const item of temporaries) {
      await operations.move(item.temporary, item.path);
      applied.push(item.path);
    }
  } catch (error) {
    for (const absolute of [...applied].reverse()) {
      const text = previous.get(absolute);
      if (text === undefined) continue;
      const recovery = join(dirname(absolute), `.${basename(absolute)}.hypit-studio.recover.tmp`);
      try {
        await operations.write(recovery, text);
        await operations.move(recovery, absolute);
      } catch {
        // Preserve the original publish error; this path is best-effort restoration.
      } finally {
        try { await operations.remove(recovery); } catch { /* already moved */ }
      }
    }
    throw error;
  } finally {
    for (const item of temporaries) {
      try { await operations.remove(item.temporary); } catch { /* already moved */ }
    }
  }
}
