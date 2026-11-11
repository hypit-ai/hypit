import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { assertSceneView, parseSceneView, serializeSceneView } from "../view.js";
import type { SceneView } from "../types.js";

async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(from, to);
    return;
  }
  const moduleName = "@hypit/atomic-file";
  const atomicFile = await import(moduleName) as { readonly replaceFile: (from: string, to: string) => Promise<void> };
  await atomicFile.replaceFile(from, to);
}

export async function readSceneViewFile(path: string): Promise<SceneView> {
  return parseSceneView(await readFile(path, "utf8"));
}

export async function writeSceneViewFile(path: string, view: SceneView): Promise<void> {
  assertSceneView(view);
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const directory = await mkdtemp(join(dirname(destination), ".hypit-scene-view-save-"));
  const temporary = join(directory, basename(destination));
  try {
    await writeFile(temporary, serializeSceneView(view), { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, destination);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
