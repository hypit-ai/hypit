import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { setTimeout as pause } from "node:timers/promises";
import type { ExecutionResourceSource, InvocationAddress, Publication, PublicationResource } from "../index.js";
import { invocationId, readInvocation, readPublication, terminal, type InvocationRecord } from "./records.js";
import { errno, identity, object } from "./values.js";

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")) as unknown; }
  catch (error) { if (errno(error, "ENOENT")) return undefined; throw error; }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.part-${randomUUID()}`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
      await file.sync();
    } finally { await file.close(); }
    // A Windows reader or file scanner may transiently deny replacement.
    for (let attempt = 0; ; attempt += 1) {
      try { await rename(temporary, path); return; }
      catch (error) {
        if (process.platform !== "win32" || attempt === 5
          || !["EPERM", "EACCES", "EBUSY"].some(code => errno(error, code))) throw error;
        await pause(20 * (attempt + 1));
      }
    }
  } finally { await rm(temporary, { force: true }); }
}

export async function stageResource(
  directory: string, resourcePath: string, source: ExecutionResourceSource, signal: AbortSignal,
): Promise<PublicationResource> {
  const path = join(directory, resourcePath);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await pipeline(source.bytes, createWriteStream(path, { flags: "wx", mode: 0o600 }), { signal });
  const file = await open(path, "r+");
  try {
    const { size } = await file.stat();
    if (source.size !== undefined && source.size !== size) throw new Error("Execution resource size differs from its declaration.");
    await file.datasync();
    return { path: resourcePath, mediaType: source.mediaType, size };
  } finally { await file.close(); }
}

export function openStoredResource(directory: string, resource: PublicationResource): ExecutionResourceSource {
  return {
    mediaType: resource.mediaType,
    size: resource.size,
    bytes: { async *[Symbol.asyncIterator]() { yield* createReadStream(join(directory, resource.path)); } },
  };
}

/** Called under the data root's writer lock. The marker moves with the deployment's records. */
export async function openEnvironmentIdentity(root: string): Promise<string> {
  const path = join(root, "environment.json");
  const saved = await readJson(path);
  if (saved !== undefined) {
    const marker = object(saved, "Execution Environment", ["format", "id"]);
    if (marker.format !== "hypit.execution-environment") throw new Error(`Invalid Execution Environment at ${root}.`);
    return identity(marker.id, "Execution Environment id");
  }
  const id = `env.${randomUUID()}`;
  await writeJson(path, { format: "hypit.execution-environment", id });
  return id;
}

export class InvocationStorage {
  readonly #root: string;
  readonly #environment: string;

  constructor(root: string, environment: string) {
    this.#root = root;
    this.#environment = environment;
  }

  directory(id: string): string {
    return join(this.#root, "invocations", id);
  }

  async open(): Promise<InvocationRecord[]> {
    const directory = join(this.#root, "invocations");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const records: InvocationRecord[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".incoming-")) {
        await rm(join(directory, entry.name), { recursive: true, force: true });
        continue;
      }
      const id = invocationId(entry.name);
      const path = join(this.directory(id), "invocation.json");
      try {
        const record = readInvocation(await readJson(path), { environment: this.#environment, invocation: id });
        records.push(record);
        if (terminal(record)) await this.clearWork(id);
      } catch (error) { throw new Error(`Cannot open Invocation record ${path}.`, { cause: error }); }
    }
    return records;
  }

  async create(record: InvocationRecord, directory: string): Promise<void> {
    await writeJson(join(directory, "invocation.json"), record);
    await rename(directory, this.directory(record.address.invocation));
  }

  async incoming(): Promise<string> {
    return await mkdtemp(join(this.#root, "invocations", ".incoming-"));
  }

  async save(record: InvocationRecord): Promise<void> {
    await writeJson(join(this.directory(record.address.invocation), "invocation.json"), record);
  }

  async clearWork(id: string): Promise<void> {
    const directory = this.directory(id);
    await Promise.all([".collecting", "inputs"].map(path => rm(join(directory, path), { recursive: true, force: true })));
  }

  async publication(address: InvocationAddress): Promise<Publication | undefined> {
    const value = await readJson(join(this.directory(address.invocation), "publication", "manifest.json"));
    return value === undefined ? undefined : readPublication(value, address);
  }

  async publish(publication: Publication): Promise<void> {
    const directory = this.directory(publication.address.invocation);
    const root = join(directory, "publication");
    const files = join(root, "files");
    // A resumed commit may have already moved the stage into the Publication.
    if (await stat(files).then(() => false, (error: unknown) => {
      if (errno(error, "ENOENT")) return true;
      throw error;
    })) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await rename(join(directory, ".collecting", "files"), files);
    }
    await writeJson(join(root, "manifest.json"), publication);
  }
}

/** SQLite holds a process-owned filesystem lock. Invocation and Publication facts live in their own files. */
export async function lockEnvironment(root: string): Promise<() => void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(join(root, ".writer.sqlite"));
  try { database.exec("BEGIN EXCLUSIVE"); }
  catch (error) {
    database.close();
    throw new Error(`Cannot acquire writer access to Execution Environment ${root}.`, { cause: error });
  }
  return () => database.close();
}
