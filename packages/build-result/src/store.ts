import { currentFileReference, localExternalFiles } from "./file-reference.js";
import type { ExternalFileAccess } from "./file-reference.js";
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

import { assertOrderedBuildId, buildIdCreatedAt } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";

import type {
  BuildResultResourceSource,
  BuildResultFileRef,
  BuildResultFileRange,
  BuildResultFinish,
  BuildResultForward,
  BuildResultManifest,
  BuildResultPresentationUpdate,
  BuildResultSeed,
  BuildResultSync,
  ResolvedBuildResultOutput,
  BuildResultRepository,
  RepositoryBuildResultOutput,
  RepositoryBuildResultOutputDescription,
  FinishedBuildResultManifest,
} from "./types.js";
import { assertBuildResultSeed } from "./types.js";
import {
  decodeBuildResultJson,
  decodeBuildResultManifest,
  decodeBuildResultValueDocument,
  decodeBuildResultWriterState,
  encodeBuildResultManifest,
} from "./decode.js";
import { syncBuildResultOutputs } from "./writer.js";
import { replaceFile } from "./replace-file.js";

const manifestName = "result.json";
const writerStateName = ".writer.json";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function applyBuildResultPresentation(
  manifest: BuildResultManifest,
  update: BuildResultPresentationUpdate,
): BuildResultManifest {
  assert(manifest.outcome !== undefined, `Build Result ${manifest.id} is not finished`);
  const base = { ...manifest } as {
    title?: string;
    note?: string;
    highlightedOutputs?: readonly string[];
  } & BuildResultManifest;
  if (update.title !== undefined) {
    if (update.title === null) delete base.title;
    else {
      const title = update.title.trim();
      assert(title.length > 0, "Build Result title must not be empty");
      base.title = title;
    }
  }
  if (update.note !== undefined) {
    if (update.note === null) delete base.note;
    else {
      const note = update.note.trim();
      assert(note.length > 0, "Build Result note must not be empty");
      base.note = note;
    }
  }
  if (update.highlightedOutputs !== undefined) {
    const highlighted = [...new Set(update.highlightedOutputs)];
    for (const output of highlighted) {
      assert(manifest.outputs[output] !== undefined,
        `Build Result ${manifest.id} has no Output ${output}`);
    }
    if (highlighted.length === 0) delete base.highlightedOutputs;
    else base.highlightedOutputs = highlighted;
  }
  if (update.outputDisplayNames !== undefined) {
    const outputs = { ...manifest.outputs };
    for (const [name, value] of Object.entries(update.outputDisplayNames)) {
      const entry = manifest.outputs[name];
      assert(Object.hasOwn(manifest.outputs, name) && entry !== undefined,
        `Build Result ${manifest.id} has no Output ${name}`);
      const { displayName: _priorName, ...rest } = entry;
      if (value === null) outputs[name] = rest;
      else {
        const displayName = value.trim();
        assert(displayName.length > 0, "Output display name must not be empty");
        outputs[name] = { ...rest, displayName };
      }
    }
    return { ...base, outputs };
  }
  return base;
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

async function writeManifestAtomic(path: string, manifest: BuildResultManifest): Promise<void> {
  await writeJsonAtomic(path, encodeBuildResultManifest(manifest));
}

async function copyArtifactAtomic(
  source: BuildResultResourceSource,
  artifact: BlobRef,
  destination: string,
): Promise<void> {
  if (await exists(destination)) return;
  await mkdir(dirname(destination), { recursive: true });
  const input = await source.open(artifact);
  if (input === undefined) throw new Error(`Build resource ${artifact.resource} is unavailable`);
  const temporary = `${destination}.part-${randomUUID()}`;
  const output = await open(temporary, "wx");
  try {
    for await (const value of input) {
      const chunk = Uint8Array.from(value);
      await output.write(chunk);
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
  assert(relation.length > 0 && relation !== ".." && !relation.startsWith(`..${sep}`),
    `Build ${build} leaves Build Result root ${directory}`);
  return target;
}

export async function readBuildResult(directory: string): Promise<BuildResultManifest | undefined> {
  const path = join(resolve(directory), manifestName);
  const bytes = await readFile(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (bytes === undefined) return undefined;
  const build = basename(resolve(directory));
  return decodeBuildResultManifest(decodeBuildResultJson(bytes, path), build, path);
}

function containedResultPath(directory: string, path: string): string {
  assert(!isAbsolute(path), `Build Result path ${path} must be relative`);
  const root = resolve(directory);
  const absolute = resolve(root, path);
  const relation = relative(root, absolute);
  assert(relation !== ".." && !relation.startsWith(`..${sep}`),
    `Build Result path ${path} leaves ${root}`);
  return absolute;
}

export async function browseBuildResults(
  root: string,
  request: { readonly before?: string; readonly limit: number },
): Promise<{ readonly results: readonly FinishedBuildResultManifest[]; readonly next?: string }> {
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
    .sort((left, right) => right.localeCompare(left));
  const found: FinishedBuildResultManifest[] = [];
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
      .sort((left, right) => right.localeCompare(left));
    for (const build of ordered) {
      const manifest = await readBuildResult(join(bucketDirectory, build));
      if (manifest?.outcome === undefined || manifest.finishedAt === undefined) continue;
      found.push(manifest as FinishedBuildResultManifest);
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
  externalFiles: ExternalFileAccess = localExternalFiles,
): Promise<ResolvedBuildResultOutput | undefined> {
  const seen = new Set<string>();
  let currentBuild = build;
  let currentOutput = output;
  while (true) {
    const address = `${currentBuild}\u0000${currentOutput}`;
    assert(!seen.has(address), `Build Output forwarding repeats ${currentBuild} / ${currentOutput}`);
    seen.add(address);
    const directory = buildResultDirectory(root, currentBuild);
    const manifest = await readBuildResult(directory);
    if (manifest === undefined) return undefined;
    const entry = manifest.outputs[currentOutput];
    if (entry === undefined) return undefined;
    if (entry.value.kind === "build-output") {
      currentBuild = entry.value.build;
      currentOutput = entry.value.output;
      continue;
    }
    if (entry.value.kind === "value") {
      const path = containedResultPath(directory, entry.value.path);
      const document = decodeBuildResultValueDocument(
        decodeBuildResultJson(await readFile(path), path),
        `Build ${currentBuild} Output ${currentOutput}`,
      );
      return {
        build: currentBuild,
        output: currentOutput,
        directory,
        type: entry.type,
        value: { ...entry.value, document },
      };
    }
    const terminalKind = (entry.value as { readonly kind?: unknown }).kind;
    assert(terminalKind === "build-file" || terminalKind === "external-file" || terminalKind === "inline",
      `Build ${currentBuild} Output ${currentOutput} has unsupported Result value kind ${String(terminalKind)}`);
    return {
      build: currentBuild,
      output: currentOutput,
      directory,
      type: entry.type,
      value: entry.value.kind === "external-file" ? await currentFileReference(entry.value, externalFiles) : entry.value,
    };
  }
}

export async function describeBuildResultOutput(
  root: string,
  build: string,
  output: string,
  externalFiles: ExternalFileAccess = localExternalFiles,
): Promise<RepositoryBuildResultOutputDescription | undefined> {
  const seen = new Set<string>();
  let currentBuild = build;
  let currentOutput = output;
  while (true) {
    const address = `${currentBuild}\u0000${currentOutput}`;
    assert(!seen.has(address), `Build Output forwarding repeats ${currentBuild} / ${currentOutput}`);
    seen.add(address);
    const manifest = await readBuildResult(buildResultDirectory(root, currentBuild));
    const entry = manifest?.outputs[currentOutput];
    if (entry === undefined) return undefined;
    if (entry.value.kind === "build-output") {
      currentBuild = entry.value.build;
      currentOutput = entry.value.output;
      continue;
    }
    const file = entry.value.kind === "external-file" ? await currentFileReference(entry.value, externalFiles) : entry.value;
    return file.kind === "build-file" || file.kind === "external-file"
      ? { type: entry.type, kind: "resource", size: file.size, mediaType: file.mediaType }
      : entry.value.kind === "value"
        ? { type: entry.type, kind: "composite" }
        : { type: entry.type, kind: "scalar" };
  }
}

/**
 * Accept only finished historical Results and reduce every new Forward to the Result that owns its
 * terminal value. This follows only the addresses named by the caller; it needs no reverse index or
 * global Result scan.
 */
export async function normalizeBuildResultForwards(
  repository: {
    read(build: string): Promise<BuildResultManifest | undefined>;
    resolve(build: string, output: string): Promise<{
      readonly build: string;
      readonly output: string;
    } | undefined>;
  },
  forwards: readonly BuildResultForward[],
): Promise<readonly BuildResultForward[]> {
  return await Promise.all(forwards.map(async (forward) => {
    const source = await repository.read(forward.build);
    assert(source?.outcome !== undefined,
      `Build ${forward.build} is not a finished Result`);
    const resolved = await repository.resolve(forward.build, forward.sourceOutput);
    assert(resolved !== undefined,
      `Build ${forward.build} has no Output ${forward.sourceOutput}`);
    const owner = resolved.build === source.id ? source : await repository.read(resolved.build);
    assert(owner?.outcome !== undefined,
      `Build ${resolved.build} is not a finished Result`);
    return {
      output: forward.output,
      build: resolved.build,
      sourceOutput: resolved.output,
    };
  }));
}

export class FileBuildResult {
  readonly directory: string;

  private constructor(directory: string) {
    this.directory = resolve(directory);
  }

  static async create(root: string, seed: BuildResultSeed, externalFiles: ExternalFileAccess = localExternalFiles): Promise<FileBuildResult> {
    assertOrderedBuildId(seed.id);
    assertBuildResultSeed(seed);
    const forwards = await normalizeBuildResultForwards({
      read: async (build) => await readBuildResult(buildResultDirectory(root, build)),
      resolve: async (build, output) => await resolveBuildResultOutput(root, build, output, externalFiles),
    }, seed.forwards ?? []);
    const directory = buildResultDirectory(root, seed.id);
    await mkdir(dirname(directory), { recursive: true });
    const temporary = join(resolve(root), `.preparing-${seed.id}-${randomUUID()}`);
    await mkdir(temporary);
    const manifest: BuildResultManifest = {
      format: "hypit.build-result@1",
      id: seed.id,
      ...(seed.title === undefined ? {} : { title: seed.title }),
      source: seed.source,
      ...(seed.run === undefined ? {} : { run: seed.run }),
      targets: [...seed.targets],
      outputs: {},
    };
    try {
      await writeManifestAtomic(join(temporary, manifestName), manifest);
      await writeJsonAtomic(join(temporary, writerStateName), {
        resources: {},
        values: {},
        publishedOutputs: seed.publishedOutputs,
        ...(seed.resourceReferences === undefined ? {} : { resourceReferences: seed.resourceReferences }),
        forwards,
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
    const manifest = await readBuildResult(absolute);
    if (manifest === undefined) throw new Error(`${absolute} has no Build Result`);
    return new FileBuildResult(absolute);
  }

  async read(): Promise<BuildResultManifest> {
    const manifest = await readBuildResult(this.directory);
    assert(manifest !== undefined, `${this.directory} has no Build Result`);
    return manifest;
  }

  async sync(input: BuildResultSync): Promise<BuildResultManifest> {
    const manifest = await this.read();
    if (manifest.outcome !== undefined) return manifest;
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
        async writeResource(path, artifact, source) {
          await copyArtifactAtomic(source, artifact, join(directory, path));
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

  async finish(input: BuildResultFinish): Promise<BuildResultManifest> {
    const manifest = await this.read();
    if (manifest.outcome !== undefined) {
      assert(manifest.outcome === input.outcome && manifest.failure === input.failure,
        `Build Result ${manifest.id} is already finished with a different outcome`);
      await rm(join(this.directory, writerStateName), { force: true });
      return manifest;
    }
    const now = Date.now();
    const updated: BuildResultManifest = {
      ...manifest,
      outcome: input.outcome,
      ...(input.operations === undefined ? {} : { operations: input.operations }),
      finishedAt: manifest.finishedAt ?? now,
      ...(input.failure === undefined ? {} : { failure: input.failure }),
    };
    await writeManifestAtomic(join(this.directory, manifestName), updated);
    await rm(join(this.directory, writerStateName), { force: true });
    return updated;
  }
}

/** Default zero-configuration project repository backed by one ordinary directory tree. */
export class FileBuildResultRepository implements BuildResultRepository {
  readonly externalFiles: ExternalFileAccess;
  readonly root: string;

  constructor(root: string, externalFiles: ExternalFileAccess = localExternalFiles) {
    this.externalFiles = externalFiles;
    assert(root.trim().length > 0, "Build Result root must not be empty");
    this.root = resolve(root);
  }

  async create(seed: BuildResultSeed): Promise<FileBuildResult> {
    return await FileBuildResult.create(this.root, seed, this.externalFiles);
  }

  async openWriter(build: string): Promise<FileBuildResult | undefined> {
    const directory = buildResultDirectory(this.root, build);
    return await readBuildResult(directory) === undefined ? undefined : await FileBuildResult.open(directory);
  }

  async removeIncomplete(build: string): Promise<void> {
    const manifest = await this.read(build);
    if (manifest === undefined) return;
    assert(manifest.outcome === undefined, `Finished Build Result ${build} cannot be removed`);
    await rm(buildResultDirectory(this.root, build), { recursive: true, force: true });
  }

  async read(build: string): Promise<BuildResultManifest | undefined> {
    return await readBuildResult(buildResultDirectory(this.root, build));
  }

  async updatePresentation(
    build: string,
    update: BuildResultPresentationUpdate,
  ): Promise<BuildResultManifest> {
    const manifest = await this.read(build);
    assert(manifest !== undefined, `Build Result ${build} does not exist`);
    const updated = applyBuildResultPresentation(manifest, update);
    await writeManifestAtomic(join(buildResultDirectory(this.root, build), manifestName), updated);
    return updated;
  }

  async browse(request: { readonly before?: string; readonly limit: number }) {
    return await browseBuildResults(this.root, request);
  }

  async describeOutput(build: string, output: string): Promise<RepositoryBuildResultOutputDescription | undefined> {
    return await describeBuildResultOutput(this.root, build, output, this.externalFiles);
  }

  async resolve(build: string, output: string): Promise<RepositoryBuildResultOutput | undefined> {
    const resolvedOutput = await resolveBuildResultOutput(this.root, build, output, this.externalFiles);
    if (resolvedOutput === undefined) return undefined;
    const { directory: _directory, ...portable } = resolvedOutput;
    return portable;
  }

  async describeFile(_build: string, file: BuildResultFileRef): Promise<BuildResultFileRef> {
    return await currentFileReference(file, this.externalFiles);
  }

  async openFile(
    build: string,
    file: BuildResultFileRef,
    range?: BuildResultFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined> {
    if (file.kind === "external-file") return await this.externalFiles.open(file.uri, range);
    const directory = buildResultDirectory(this.root, file.build ?? build);
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
