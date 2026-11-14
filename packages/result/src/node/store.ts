import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import { compareCodeUnits } from "@hypit/protocol";
import { assertOrderedBuildId, buildIdCreatedAt } from "@hypit/generation-build";
import {
  decodeBuildResultJson,
  decodeFinishedBuildResult,
} from "../decode.js";
import type { StoredBuildResultFile, StoredFinishedBuildResult } from "../decode.js";
import type { BuildResult, BuildResultFileRange, BuildResultHistory } from "../types.js";

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

function historyResult(manifest: StoredFinishedBuildResult): BuildResult {
  const common = {
    format: manifest.format,
    id: manifest.id,
    sourcePath: manifest.sourcePath,
    targets: manifest.targets,
    outputs: manifest.outputs,
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

  async openExecutionLog(build: string): Promise<AsyncIterable<Uint8Array> | undefined> {
    const directory = buildResultDirectory(this.root, build);
    const manifest = await readFinishedBuildResult(directory);
    return manifest?.executionLog === undefined ? undefined : await openContainedResultFile(directory, manifest.executionLog);
  }
}
