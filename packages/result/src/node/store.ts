import { preserveExecutionLog } from "../execution-log.js";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { assertOrderedBuildId, buildIdCreatedAt, compareCodeUnits } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

import type {
  BuildResultResourceSource,
  BuildResultFileRef,
  BuildResultFileRange,
  BuildResultFinish,
  BuildResult,
  BuildResultDraft,
  BuildResultSeed,
  BuildResultSync,
  BuildResultHistory,
  BuildResultStore,
  RepositoryBuildResultOutput,
  StoredBuildResult,
} from "../types.js";
import { assertBuildResultSeed, buildResultOutput, defineBuildResultOutput } from "../types.js";
import {
  decodeBuildResultJson,
  decodeStoredBuildResult,
  decodeBuildResultValueDocument,
  decodeBuildResultWriterState,
  encodeStoredBuildResult,
} from "../decode.js";
import { syncBuildResultOutputs } from "../writer.js";
import { replaceFile } from "@hypit/atomic-file";

const manifestName = "result.json";
const writerStateName = ".writer.json";

/** File-repository-local resolution detail used only while opening contained files. */
export type ResolvedFileBuildResultOutput = RepositoryBuildResultOutput & {
  readonly directory: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then((item) => item.isFile(), () => false);
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

function buildResultDateBucket(build: string): string | undefined {
  const createdAt = buildIdCreatedAt(build);
  return createdAt === undefined ? undefined : new Date(createdAt).toISOString().slice(0, 10);
}

export function buildResultDirectory(root: string, build: string): string {
  assertOrderedBuildId(build);
  const directory = resolve(root);
  const bucket = buildResultDateBucket(build)!;
  const target = resolve(directory, bucket, build);
  const relation = relative(directory, target);
  assert(relation.length > 0 && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation),
    `Build ${build} leaves Build Result root ${directory}`);
  return target;
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

function containedResultPath(directory: string, path: string): string {
  assert(!isAbsolute(path), `Build Result path ${path} must be relative`);
  const root = resolve(directory);
  const absolute = resolve(root, path);
  const relation = relative(root, absolute);
  assert(relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation),
    `Build Result path ${path} leaves ${root}`);
  return absolute;
}

export async function browseBuildResults(
  root: string,
  request: { readonly before?: string; readonly limit: number },
): Promise<{ readonly results: readonly BuildResult[]; readonly next?: string }> {
  assert(Number.isSafeInteger(request.limit) && request.limit > 0, "Build Result browse limit must be positive");
  if (request.before !== undefined) assertOrderedBuildId(request.before);
  const directory = resolve(root);
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  const beforeBucket = request.before === undefined
    ? undefined
    : buildResultDateBucket(request.before)!;
  const buckets = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/u.test(entry.name))
    .map((entry) => entry.name)
    .filter((bucket) => beforeBucket === undefined || bucket <= beforeBucket)
    .sort((left, right) => compareCodeUnits(right, left));
  const found: BuildResult[] = [];
  for (const bucket of buckets) {
    const bucketDirectory = join(directory, bucket);
    const builds = await readdir(bucketDirectory, { withFileTypes: true }).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    });
    const ordered = builds
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((build) => {
        return buildResultDateBucket(build) === bucket
          && (request.before === undefined || build < request.before);
      })
      .sort((left, right) => compareCodeUnits(right, left));
    for (const build of ordered) {
      const manifest = await readStoredBuildResult(join(bucketDirectory, build));
      if (manifest?.outcome === undefined) continue;
      found.push(manifest as BuildResult);
      if (found.length > request.limit) break;
    }
    if (found.length > request.limit) break;
  }
  const results = found.slice(0, request.limit);
  return {
    results,
    ...(found.length > request.limit && results.length > 0 ? { next: results[results.length - 1]!.id } : {}),
  };
}

export async function resolveBuildResultOutput(
  root: string,
  build: string,
  output: string,
): Promise<ResolvedFileBuildResultOutput | undefined> {
  const directory = buildResultDirectory(root, build);
  const manifest = await readStoredBuildResult(directory);
  if (manifest === undefined || manifest.outcome === undefined) return undefined;
  const entry = buildResultOutput(manifest, output);
  if (entry === undefined) return undefined;
  if (entry.value.kind === "value") {
    const path = containedResultPath(directory, entry.value.path);
    const document = decodeBuildResultValueDocument(
      decodeBuildResultJson(await readFile(path), path),
      `Build ${build} Output ${output}`,
    );
    return { directory, type: entry.type, value: { ...entry.value, document } };
  }
  return {
    directory,
    type: entry.type,
    value: entry.value,
  };
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

  async finish(input: BuildResultFinish): Promise<BuildResult> {
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
        .filter((output) => buildResultOutput(manifest, output) === undefined);
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
    const updated: BuildResult = input.outcome === "complete"
      ? { ...evidence, outcome: "complete" }
      : { ...evidence, outcome: input.outcome, failure: input.failure };
    await writeManifestAtomic(join(this.directory, manifestName), updated);
    await rm(join(this.directory, writerStateName), { force: true });
    return updated;
  }
}

/** Finished project history backed by one ordinary directory tree. */
export class FileBuildResultHistory implements BuildResultHistory {
  readonly root: string;

  constructor(root: string) {
    assert(root.trim().length > 0, "Build Result root must not be empty");
    this.root = resolve(root);
  }

  async read(build: string): Promise<BuildResult | undefined> {
    const manifest = await readStoredBuildResult(buildResultDirectory(this.root, build));
    return manifest?.outcome === undefined ? undefined : manifest;
  }

  async browse(request: { readonly before?: string; readonly limit: number }) {
    return await browseBuildResults(this.root, request);
  }

  async resolve(build: string, output: string): Promise<RepositoryBuildResultOutput | undefined> {
    const resolvedOutput = await resolveBuildResultOutput(this.root, build, output);
    if (resolvedOutput === undefined) return undefined;
    const { directory: _directory, ...portable } = resolvedOutput;
    return portable;
  }

  async openFile(
    build: string,
    file: BuildResultFileRef,
    range?: BuildResultFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined> {
    const directory = buildResultDirectory(this.root, build);
    const path = containedResultPath(directory, file.path);
    if (!await exists(path)) return undefined;
    if (range === undefined) return createReadStream(path);
    assert(Number.isSafeInteger(range.start) && range.start >= 0, "Build Result file range start is invalid");
    assert(Number.isSafeInteger(range.endExclusive) && range.endExclusive > range.start,
      "Build Result file range end is invalid");
    assert(range.endExclusive <= file.size, "Build Result file range exceeds the declared file size");
    return createReadStream(path, { start: range.start, end: range.endExclusive - 1 });
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
