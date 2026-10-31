import { preserveExecutionLog } from "./execution-log.js";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { assertOrderedBuildId } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";
import { FileBuildResultHistory, buildResultDirectory } from "@hypit/hypit/result/node";

import type {
  BuildResultResourceSource,
  BuildResultFinish,
  BuildResultDraft,
  BuildResultSeed,
  BuildResultSync,
  BuildResultStore,
  StoredBuildResult,
  StoredFinishedBuildResult,
} from "./types.js";
import { assertBuildResultSeed, storedBuildResultOutput } from "./types.js";
import {
  decodeBuildResultJson,
  decodeStoredBuildResult,
  decodeBuildResultWriterState,
  encodeStoredBuildResult,
} from "./decode.js";
import { syncBuildResultOutputs } from "./writer.js";
import { replaceFile } from "@hypit/hypit/atomic-file";

const manifestName = "result.json";
const writerStateName = ".writer.json";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.part-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await replaceFile(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function writeManifestAtomic(path: string, manifest: StoredBuildResult): Promise<void> {
  await writeJsonAtomic(path, encodeStoredBuildResult(manifest));
}

async function copyBlobAtomic(
  source: BuildResultResourceSource,
  blob: BlobRef,
  destination: string,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const input = await source.open(blob);
  if (input === undefined) throw new Error(`Build resource ${blob.resource} is unavailable`);
  await writeStreamAtomic(destination, input);
}

async function writeStreamAtomic(destination: string, input: AsyncIterable<Uint8Array>): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${randomUUID()}`;
  const output = await open(temporary, "wx");
  try {
    for await (const value of input) {
      const chunk = Uint8Array.from(value);
      let offset = 0;
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await output.write(chunk, offset, chunk.byteLength - offset);
        offset += bytesWritten;
      }
    }
    await output.close();
    await replaceFile(temporary, destination);
  } catch (error) {
    await output.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
}

async function readStoredBuildResult(directory: string): Promise<StoredBuildResult | undefined> {
  const path = join(resolve(directory), manifestName);
  const bytes = await readFile(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (bytes === undefined) return undefined;
  const build = basename(resolve(directory));
  return decodeStoredBuildResult(decodeBuildResultJson(bytes, path), build, path);
}

export class FileBuildResult {
  readonly directory: string;

  private constructor(directory: string) {
    this.directory = resolve(directory);
  }

  static async create(root: string, seed: BuildResultSeed): Promise<FileBuildResult> {
    assertOrderedBuildId(seed.id);
    assertBuildResultSeed(seed);
    const intent = seed.intent;
    const directory = buildResultDirectory(root, seed.id);
    await mkdir(dirname(directory), { recursive: true });
    const temporary = join(resolve(root), `.preparing-${seed.id}-${randomUUID()}`);
    await mkdir(temporary);
    const manifest: BuildResultDraft = {
      format: "hypit.build-result@1",
      id: seed.id,
      sourcePath: seed.sourcePath,
      targets: [...seed.targets],
      outputs: {},
    };
    try {
      await writeManifestAtomic(join(temporary, manifestName), manifest);
      await writeJsonAtomic(join(temporary, writerStateName), {
        resources: {},
        values: {},
        intent,
      });
      await rename(temporary, directory);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
    return new FileBuildResult(directory);
  }

  static async open(directory: string): Promise<FileBuildResult> {
    const absolute = resolve(directory);
    const manifest = await readStoredBuildResult(absolute);
    if (manifest === undefined) throw new Error(`${absolute} has no Build Result`);
    return new FileBuildResult(absolute);
  }

  async read(): Promise<StoredBuildResult> {
    const manifest = await readStoredBuildResult(this.directory);
    assert(manifest !== undefined, `${this.directory} has no Build Result`);
    return manifest;
  }

  async sync(input: BuildResultSync): Promise<StoredBuildResult> {
    const manifest = await this.read();
    if ("outcome" in manifest) return manifest;
    const writerPath = join(this.directory, writerStateName);
    const writer = decodeBuildResultWriterState(
      decodeBuildResultJson(await readFile(writerPath), writerPath),
      writerPath,
    );
    const directory = this.directory;
    const updated = await syncBuildResultOutputs({
      manifest,
      writer,
      sync: input,
      target: {
        async writeResource(path, blob, source) {
          await copyBlobAtomic(source, blob, join(directory, path));
        },
        async writeValue(path, document) {
          await writeJsonAtomic(join(directory, path), document);
        },
      },
    });
    if (!updated.changed) return manifest;
    await writeJsonAtomic(join(this.directory, writerStateName), updated.writer);
    await writeManifestAtomic(join(this.directory, manifestName), updated.manifest);
    return updated.manifest;
  }

  async finish(input: BuildResultFinish): Promise<StoredFinishedBuildResult> {
    const manifest = await this.read();
    if ("outcome" in manifest) {
      assert(manifest.outcome === input.outcome && manifest.failure === input.failure,
        `Build Result ${manifest.id} is already finished with a different outcome`);
      await rm(join(this.directory, writerStateName), { force: true });
      return manifest;
    }
    if (input.outcome === "complete") {
      const writerPath = join(this.directory, writerStateName);
      const writer = decodeBuildResultWriterState(
        decodeBuildResultJson(await readFile(writerPath), writerPath),
        writerPath,
      );
      const missing = writer.intent.outputs
        .map((output) => output.name)
        .filter((output) => storedBuildResultOutput(manifest, output) === undefined);
      assert(missing.length === 0,
        `Build Result ${manifest.id} cannot complete before retained Outputs are stored: ${missing.join(", ")}`);
    }
    const executionLog = await preserveExecutionLog(input.executionLog,
      async (path, chunks) => await writeStreamAtomic(join(this.directory, path), chunks));
    const now = Date.now();
    const evidence = {
      ...manifest,
      ...(executionLog === undefined ? {} : { executionLog }),
      ...(input.operations === undefined ? {} : { operations: input.operations }),
      finishedAt: now,
    };
    const updated: StoredFinishedBuildResult = input.outcome === "complete"
      ? { ...evidence, outcome: "complete" }
      : { ...evidence, outcome: input.outcome, failure: input.failure };
    await writeManifestAtomic(join(this.directory, manifestName), updated);
    await rm(join(this.directory, writerStateName), { force: true });
    return updated;
  }
}

/** Runtime-only writable publication and recovery store. */
export class FileBuildResultStore extends FileBuildResultHistory implements BuildResultStore {
  async create(seed: BuildResultSeed): Promise<FileBuildResult> {
    return await FileBuildResult.create(this.root, seed);
  }

  async openWriter(build: string): Promise<FileBuildResult | undefined> {
    const directory = buildResultDirectory(this.root, build);
    return await readStoredBuildResult(directory) === undefined ? undefined : await FileBuildResult.open(directory);
  }

  async removeIncomplete(build: string): Promise<void> {
    const manifest = await this.readStored(build);
    if (manifest === undefined) return;
    assert(manifest.outcome === undefined, `Finished Build Result ${build} cannot be removed`);
    await rm(buildResultDirectory(this.root, build), { recursive: true, force: true });
  }

  async readStored(build: string): Promise<StoredBuildResult | undefined> {
    return await readStoredBuildResult(buildResultDirectory(this.root, build));
  }
}
