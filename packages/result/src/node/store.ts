import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import { assertOrderedBuildId, buildIdCreatedAt, compareCodeUnits } from "@hypit/protocol";
import type { BlobRef, CanonicalValue, Value, ValuePath } from "@hypit/protocol";
import {
  decodeBuildResultJson,
  decodeBuildResultValueDocument,
  decodeFinishedBuildResult,
} from "../decode.js";
import type {
  StoredBuildResultFile,
  StoredBuildResultOutput,
  StoredFinishedBuildResult,
} from "../decode.js";
import type {
  BuildResult,
  BuildResultFileRange,
  BuildResultHistory,
  BuildResultOutput,
  ResolvedBuildResultOutput,
} from "../types.js";

const manifestName = "result.json";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then((item) => item.isFile(), () => false);
}

function buildResultDateBucket(build: string): string {
  const createdAt = buildIdCreatedAt(build);
  assert(createdAt !== undefined, `Build ${build} has no ordered creation time`);
  return new Date(createdAt).toISOString().slice(0, 10);
}

export function buildResultDirectory(root: string, build: string): string {
  assertOrderedBuildId(build);
  const directory = resolve(root);
  const target = resolve(directory, buildResultDateBucket(build), build);
  const relation = relative(directory, target);
  assert(relation.length > 0 && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation),
    `Build ${build} leaves Build Result root ${directory}`);
  return target;
}

async function readFinishedBuildResult(directory: string): Promise<StoredFinishedBuildResult | undefined> {
  const path = join(resolve(directory), manifestName);
  const bytes = await readFile(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (bytes === undefined) return undefined;
  return decodeFinishedBuildResult(decodeBuildResultJson(bytes, path), basename(resolve(directory)), path);
}

function historyOutput(output: StoredBuildResultOutput): BuildResultOutput {
  const publication = {
    publisher: output.publisher,
    ...(output.publicationParameters === undefined
      ? {}
      : { publicationParameters: output.publicationParameters }),
  };
  if (output.value.kind === "build-file") {
    return { type: output.type, ...publication,
      representation: "file", mediaType: output.value.mediaType, size: output.value.size };
  }
  return output.value.kind === "inline"
    ? { type: output.type, ...publication, representation: "inline", value: output.value.value }
    : { type: output.type, ...publication, representation: "structured" };
}

function historyResult(manifest: StoredFinishedBuildResult): BuildResult {
  const common = {
    format: manifest.format,
    id: manifest.id,
    sourcePath: manifest.sourcePath,
    targets: manifest.targets,
    outputs: Object.fromEntries(Object.entries(manifest.outputs)
      .map(([name, output]) => [name, historyOutput(output)])),
    ...(manifest.executionLog === undefined ? {} : { executionLog: true as const }),
    ...(manifest.operations === undefined ? {} : { operations: manifest.operations }),
  };
  return manifest.outcome === "complete"
    ? { ...common, outcome: "complete", finishedAt: manifest.finishedAt }
    : { ...common, outcome: manifest.outcome, finishedAt: manifest.finishedAt, failure: manifest.failure };
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
  const beforeBucket = request.before === undefined ? undefined : buildResultDateBucket(request.before);
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
      .filter((build) => buildResultDateBucket(build) === bucket
        && (request.before === undefined || build < request.before))
      .sort((left, right) => compareCodeUnits(right, left));
    for (const build of ordered) {
      const manifest = await readFinishedBuildResult(join(bucketDirectory, build));
      if (manifest === undefined) continue;
      found.push(historyResult(manifest));
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

async function openContainedResultFile(
  directory: string,
  file: StoredBuildResultFile,
  range?: BuildResultFileRange,
): Promise<AsyncIterable<Uint8Array> | undefined> {
  const path = containedResultPath(directory, file.path);
  if (!await exists(path)) return undefined;
  if (range === undefined) return createReadStream(path);
  assert(Number.isSafeInteger(range.start) && range.start >= 0, "Build Result file range start is invalid");
  assert(Number.isSafeInteger(range.endExclusive) && range.endExclusive > range.start,
    "Build Result file range end is invalid");
  assert(range.endExclusive <= file.size, "Build Result file range exceeds the declared file size");
  return createReadStream(path, { start: range.start, end: range.endExclusive - 1 });
}

export async function resolveBuildResultOutput(
  root: string,
  build: string,
  output: string,
): Promise<ResolvedBuildResultOutput | undefined> {
  const directory = buildResultDirectory(root, build);
  const manifest = await readFinishedBuildResult(directory);
  const entry = manifest === undefined || !Object.hasOwn(manifest.outputs, output)
    ? undefined
    : manifest.outputs[output];
  if (entry === undefined) return undefined;
  const resources = new Map<string, { readonly blob: BlobRef; readonly file: StoredBuildResultFile }>();
  const boundFiles = new Map<string, BlobRef>();
  const bind = (file: StoredBuildResultFile, index: number): BlobRef => {
    const identity = JSON.stringify([file.path, file.size, file.mediaType]);
    const existing = boundFiles.get(identity);
    if (existing !== undefined) return existing;
    const blob: BlobRef = {
      kind: "blob",
      resource: `res_result_${build}_${Buffer.from(output, "utf8").toString("base64url")}_${index}`,
      size: file.size,
      mediaType: file.mediaType,
    };
    boundFiles.set(identity, blob);
    resources.set(blob.resource, { blob, file });
    return blob;
  };
  let value: Value;
  if (entry.value.kind === "value") {
    const path = containedResultPath(directory, entry.value.path);
    const document = decodeBuildResultValueDocument(
      decodeBuildResultJson(await readFile(path), path),
      `Build ${build} Output ${output}`,
    );
    const bindings = new Map(document.resources.map((binding, index) => [JSON.stringify(binding.at), bind(binding.file, index)]));
    const inflate = (item: CanonicalValue, at: ValuePath): Value => {
      const blob = bindings.get(JSON.stringify(at));
      if (blob !== undefined) return blob;
      if (Array.isArray(item)) return item.map((child, index) => inflate(child, [...at, index]));
      if (item !== null && typeof item === "object") {
        return Object.fromEntries(Object.entries(item).map(([name, child]) => [name, inflate(child, [...at, name])]));
      }
      return item;
    };
    value = inflate(document.value, []);
  } else if (entry.value.kind === "build-file") value = bind(entry.value, 0);
  else value = entry.value.value;
  return {
    type: entry.type,
    publisher: entry.publisher,
    ...(entry.publicationParameters === undefined
      ? {}
      : { publicationParameters: entry.publicationParameters }),
    value,
    async openResource(blob, range) {
      const owned = resources.get(blob.resource);
      if (owned === undefined || owned.blob.size !== blob.size || owned.blob.mediaType !== blob.mediaType) return undefined;
      return await openContainedResultFile(directory, owned.file, range);
    },
  };
}

/** Finished project history backed by one ordinary directory tree. */
export class FileBuildResultHistory implements BuildResultHistory {
  readonly root: string;

  constructor(root: string) {
    assert(root.trim().length > 0, "Build Result root must not be empty");
    this.root = resolve(root);
  }

  async read(build: string): Promise<BuildResult | undefined> {
    const manifest = await readFinishedBuildResult(buildResultDirectory(this.root, build));
    return manifest === undefined ? undefined : historyResult(manifest);
  }

  async browse(request: { readonly before?: string; readonly limit: number }) {
    return await browseBuildResults(this.root, request);
  }

  async resolve(build: string, output: string): Promise<ResolvedBuildResultOutput | undefined> {
    return await resolveBuildResultOutput(this.root, build, output);
  }

  async openExecutionLog(build: string): Promise<AsyncIterable<Uint8Array> | undefined> {
    const directory = buildResultDirectory(this.root, build);
    const manifest = await readFinishedBuildResult(directory);
    return manifest?.executionLog === undefined ? undefined : await openContainedResultFile(directory, manifest.executionLog);
  }
}
