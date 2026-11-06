import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  assertNleProjectSaveTicket,
  openNleProjectText,
} from "../store.js";
import type { NleEditSession } from "../session.js";
import type { NleProjectSaveTicket } from "../store.js";

async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(from, to);
    return;
  }
  // Keep package resolution lazy so a source checkout can run POSIX tests even when an unrelated
  // broken workspace prevents pnpm from refreshing local links. Published packages install this dependency.
  const moduleName = "@hypit/atomic-file";
  const atomicFile = await import(moduleName) as { readonly replaceFile: (from: string, to: string) => Promise<void> };
  await atomicFile.replaceFile(from, to);
}

/** Reads and validates one complete `hypit.nle@1` JSON file. */
export async function readNleProjectFile(path: string): Promise<NleEditSession> {
  return openNleProjectText(await readFile(path, "utf8"));
}

/**
 * Publishes the exact prepared bytes by same-filesystem replacement.
 * Call `completeNleProjectSave` only after this promise succeeds.
 */
export async function writeNleProjectFile(path: string, ticket: NleProjectSaveTicket): Promise<void> {
  assertNleProjectSaveTicket(ticket);
  const destination = resolve(path);
  const temporaryDirectory = await mkdtemp(join(dirname(destination), ".hypit-nle-save-"));
  const temporary = join(temporaryDirectory, basename(destination));
  try {
    await writeFile(temporary, ticket.text, { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, destination);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
