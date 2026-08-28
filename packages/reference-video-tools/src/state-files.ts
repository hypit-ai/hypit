import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export function executionId(kind: string, now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  return `${kind}-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export async function digestPath(path: string): Promise<string | undefined> {
  const bytes = await readFile(path).catch(() => undefined);
  return bytes === undefined ? undefined : sha256(bytes);
}

export async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

export async function atomicJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, jsonBytes(value));
}

export async function persistExecutionState(
  projectRoot: string,
  currentName: string,
  historyKind: "routes" | "revisions",
  executionIdValue: string,
  value: unknown,
): Promise<string> {
  const root = resolve(projectRoot);
  const historyPath = join(root, ".hypit", historyKind, executionIdValue, "state.json");
  const bytes = jsonBytes(value);
  await atomicWrite(historyPath, bytes);
  await atomicWrite(join(root, ".hypit", currentName), bytes);
  return historyPath;
}

export async function persistEvidence(
  projectRoot: string,
  currentName: string,
  value: unknown,
): Promise<string> {
  const root = resolve(projectRoot);
  const bytes = jsonBytes(value);
  const digest = sha256(bytes).slice("sha256:".length);
  const evidencePath = join(root, ".hypit", "evidence", digest, currentName);
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, bytes, { flag: "wx" }).catch(async (error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(evidencePath);
    if (!existing.equals(bytes)) throw new Error(`immutable evidence collision at ${evidencePath}`);
  });
  await atomicWrite(join(root, ".hypit", currentName), bytes);
  return evidencePath;
}
