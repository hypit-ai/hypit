import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  parseGenerationCanvasView,
  serializeGenerationCanvasView,
} from "../project.js";
import type { GenerationCanvasView } from "../types.js";

async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(from, to);
    return;
  }
  const moduleName = "@hypit/atomic-file";
  const atomicFile = await import(moduleName) as { readonly replaceFile: (from: string, to: string) => Promise<void> };
  await atomicFile.replaceFile(from, to);
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(destination), ".hypit-generation-canvas-save-"));
  const temporary = join(temporaryDirectory, basename(destination));
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, destination);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function readGenerationCanvasViewFile(path: string): Promise<GenerationCanvasView> {
  return parseGenerationCanvasView(await readFile(path, "utf8"));
}

export async function writeGenerationCanvasViewFile(
  path: string,
  view: GenerationCanvasView,
): Promise<void> {
  await writeAtomic(path, serializeGenerationCanvasView(view));
}
