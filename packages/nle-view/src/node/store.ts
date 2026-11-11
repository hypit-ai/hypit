import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { parseNleTimelineView, serializeNleTimelineView } from "../view.js";
import type { NleTimelineView } from "../types.js";

async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(from, to);
    return;
  }
  const moduleName = "@hypit/atomic-file";
  const atomicFile = await import(moduleName) as { readonly replaceFile: (from: string, to: string) => Promise<void> };
  await atomicFile.replaceFile(from, to);
}

export async function readNleTimelineViewFile(path: string): Promise<NleTimelineView> {
  return parseNleTimelineView(await readFile(path, "utf8"));
}

export async function writeNleTimelineViewFile(path: string, view: NleTimelineView): Promise<void> {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const directory = await mkdtemp(join(dirname(destination), ".hypit-nle-view-save-"));
  const temporary = join(directory, basename(destination));
  try {
    await writeFile(temporary, serializeNleTimelineView(view), { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, destination);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
