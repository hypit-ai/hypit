import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { assertSceneProjectSaveTicket, openSceneProjectText } from "../store.js";
import type { SceneEditSession } from "../session.js";
import type { SceneProjectSaveTicket } from "../store.js";

async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(from, to);
    return;
  }
  const moduleName = "@hypit/atomic-file";
  const atomicFile = await import(moduleName) as { readonly replaceFile: (from: string, to: string) => Promise<void> };
  await atomicFile.replaceFile(from, to);
}

export async function readSceneProjectFile(path: string): Promise<SceneEditSession> {
  return openSceneProjectText(await readFile(path, "utf8"));
}

export async function writeSceneProjectFile(path: string, ticket: SceneProjectSaveTicket): Promise<void> {
  assertSceneProjectSaveTicket(ticket);
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const directory = await mkdtemp(join(dirname(destination), ".hypit-scene-save-"));
  const temporary = join(directory, basename(destination));
  try {
    await writeFile(temporary, ticket.text, { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, destination);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
