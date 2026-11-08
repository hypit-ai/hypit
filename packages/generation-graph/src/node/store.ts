import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  parseGenerationGraphProject,
  serializeGenerationGraphProject,
} from "../project.js";
import type { GenerationGraphProject } from "../types.js";

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
  const temporaryDirectory = await mkdtemp(join(dirname(destination), ".hypit-generation-graph-save-"));
  const temporary = join(temporaryDirectory, basename(destination));
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, destination);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function readGenerationGraphProjectFile(path: string): Promise<GenerationGraphProject> {
  return parseGenerationGraphProject(await readFile(path, "utf8"));
}

export async function writeGenerationGraphProjectFile(
  path: string,
  project: GenerationGraphProject,
): Promise<void> {
  await writeAtomic(path, serializeGenerationGraphProject(project));
}
