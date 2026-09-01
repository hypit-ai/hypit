import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { BlobRef, BuildState, StoredValue, TypedRecord } from "@hypit/protocol";

import type {
  BuildResultArtifactSource,
  BuildResultFileRef,
  BuildResultFinish,
  BuildResultJsonValue,
  BuildResultManifest,
  BuildResultOutput,
  BuildResultSeed,
  BuildResultSync,
  HistoricalBuildOutputRef,
  ResolvedBuildResultOutput,
} from "./types.js";

type WriterState = {
  readonly resources: Readonly<Record<string, string>>;
};

const manifestName = "result.json";
const writerStateName = ".writer.json";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeName(value: string): string {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return safe.length === 0 ? "output" : safe;
}

function valueFileName(output: string): string {
  return `${encodeURIComponent(output)}.json`;
}

function mediaExtension(mediaType: string): string {
  const subtype = mediaType.split("/", 2)[1]?.split(";", 1)[0]?.trim().toLowerCase();
  if (subtype === undefined || subtype.length === 0) return ".bin";
  const conventional = subtype === "jpeg" ? "jpg" : subtype === "x-wav" ? "wav" : subtype;
  const suffix = conventional.includes("+") ? conventional.slice(0, conventional.indexOf("+")) : conventional;
  const safe = suffix.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return safe.length === 0 ? ".bin" : `.${safe}`;
}

function isBlobRef(value: unknown): value is BlobRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.kind === "blob"
    && typeof item.digest === "string"
    && typeof item.size === "number"
    && Number.isSafeInteger(item.size)
    && item.size >= 0
    && typeof item.mediaType === "string"
    && item.mediaType.length > 0;
}

function scalar(value: unknown): value is null | boolean | number | string {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

function resourceIdentity(artifact: BlobRef): string {
  assert(artifact.resource !== undefined,
    "Build resource has no instance identity; the producing Store must return BlobRef.resource");
  return artifact.resource;
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then((item) => item.isFile(), () => false);
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.part-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function copyArtifactAtomic(
  source: BuildResultArtifactSource,
  artifact: BlobRef,
  destination: string,
): Promise<void> {
  if (await exists(destination)) return;
  await mkdir(dirname(destination), { recursive: true });
  const input = await source.open(artifact);
  if (input === undefined) throw new Error(`Build resource ${resourceIdentity(artifact)} is unavailable`);
  const temporary = `${destination}.part-${randomUUID()}`;
  const output = await open(temporary, "wx");
  try {
    for await (const value of input) {
      const chunk = Uint8Array.from(value);
      await output.write(chunk);
    }
    await output.close();
    await rename(temporary, destination);
  } catch (error) {
    await output.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
}

function outputRecord(state: BuildState, output: string): TypedRecord | undefined {
  const selection = state.plan.selections.find((item) => item.output === output);
  if (selection === undefined) return undefined;
  return state.records.find((item) => item.id === selection.record);
}

function outputCandidate(state: BuildState, output: string): string | undefined {
  return state.plan.selections.find((item) => item.output === output)?.candidate;
}

export function buildResultDirectory(root: string, build: string): string {
  assert(build.trim().length > 0 && !build.includes("/") && !build.includes("\\"), "Build id is not a directory name");
  return join(resolve(root), build);
}

export async function readBuildResult(directory: string): Promise<BuildResultManifest | undefined> {
  const path = join(resolve(directory), manifestName);
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (text === undefined) return undefined;
  const value = JSON.parse(text) as BuildResultManifest;
  assert(value.format === "hypit.build-result@1", `${path} is not a Hypit Build Result`);
  return value;
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

export async function listBuildResults(root: string): Promise<readonly BuildResultManifest[]> {
  const directory = resolve(root);
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  });
  const manifests = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const manifest = await readBuildResult(join(directory, entry.name));
      assert(manifest !== undefined, `${join(directory, entry.name)} has no result.json`);
      return manifest;
    }));
  return manifests.sort((left, right) => right.startedAt - left.startedAt || left.id.localeCompare(right.id));
}

export async function resolveBuildResultOutput(
  root: string,
  build: string,
  output: string,
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
    if (entry.value.kind === "json") {
      const value = JSON.parse(await readFile(containedResultPath(directory, entry.value.path), "utf8")) as BuildResultJsonValue;
      return {
        build: currentBuild,
        output: currentOutput,
        directory,
        type: entry.type,
        value: { ...entry.value, value },
      };
    }
    return {
      build: currentBuild,
      output: currentOutput,
      directory,
      type: entry.type,
      value: entry.value,
    };
  }
}

export async function materializeBuildResultOutput(
  root: string,
  build: string,
  output: string,
  destination: string,
): Promise<{
  readonly build: string;
  readonly output: string;
  readonly path: string;
  readonly kind: "file" | "json" | "inline";
}> {
  const resolvedOutput = await resolveBuildResultOutput(root, build, output);
  if (resolvedOutput === undefined) throw new Error(`Build ${build} has no Output ${output}`);
  const target = resolve(destination);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.part-${randomUUID()}`;
  try {
    if (resolvedOutput.value.kind === "inline") {
      await writeFile(temporary, `${JSON.stringify(resolvedOutput.value.value, null, 2)}\n`, { flag: "wx" });
    } else {
      const sourceDirectory = resolvedOutput.value.kind === "build-file" && resolvedOutput.value.build !== undefined
        ? buildResultDirectory(root, resolvedOutput.value.build)
        : resolvedOutput.directory;
      await copyFile(containedResultPath(sourceDirectory, resolvedOutput.value.path), temporary);
    }
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return {
    build: resolvedOutput.build,
    output: resolvedOutput.output,
    path: target,
    kind: resolvedOutput.value.kind === "build-file"
      ? "file"
      : resolvedOutput.value.kind === "json" ? "json" : "inline",
  };
}

export class FileBuildResult {
  readonly directory: string;

  private constructor(directory: string) {
    this.directory = resolve(directory);
  }

  static async create(root: string, seed: BuildResultSeed): Promise<FileBuildResult> {
    const directory = buildResultDirectory(root, seed.id);
    assert(seed.name === undefined || seed.name.trim().length > 0, "Build Result name must not be empty");
    await mkdir(directory, { recursive: true });
    const existing = await readBuildResult(directory);
    if (existing !== undefined) throw new Error(`Build Result ${seed.id} already exists`);
    const now = seed.startedAt ?? Date.now();
    const manifest: BuildResultManifest = {
      format: "hypit.build-result@1",
      id: seed.id,
      ...(seed.name === undefined ? {} : { name: seed.name }),
      source: seed.source,
      ...(seed.run === undefined ? {} : { run: seed.run }),
      targets: [...seed.targets],
      startedAt: now,
      updatedAt: now,
      status: "running",
      outputs: {},
    };
    await writeJsonAtomic(join(directory, manifestName), manifest);
    await writeJsonAtomic(join(directory, writerStateName), {
      resources: {},
      aliases: seed.aliases,
      reuses: seed.reuses ?? [],
    });
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
    if (manifest.status !== "running") return manifest;
    const rawWriter = await readFile(join(this.directory, writerStateName), "utf8");
    const writer = JSON.parse(rawWriter) as WriterState & {
      readonly aliases: readonly { readonly name: string; readonly output: string }[];
      readonly reuses: readonly { readonly candidate: string; readonly build: string; readonly output: string }[];
    };
    const resources = new Map(Object.entries(writer.resources));
    const outputs: Record<string, BuildResultOutput> = { ...manifest.outputs };
    const materialize = async (
      artifact: BlobRef,
      preferredName: string,
    ): Promise<BuildResultFileRef> => {
      if (artifact.origin !== undefined) {
        return {
          kind: "build-file",
          build: artifact.origin.build,
          path: artifact.origin.path,
          size: artifact.size,
          mediaType: artifact.mediaType,
        };
      }
      const identity = resourceIdentity(artifact);
      let relativePath = resources.get(identity);
      if (relativePath === undefined) {
        const base = safeName(preferredName);
        let candidate = join("files", `${base}${mediaExtension(artifact.mediaType)}`);
        let counter = 2;
        const occupied = new Set(resources.values());
        while (occupied.has(candidate)) {
          candidate = join("files", `${base}-${counter}${mediaExtension(artifact.mediaType)}`);
          counter += 1;
        }
        relativePath = candidate;
        resources.set(identity, relativePath);
      }
      await copyArtifactAtomic(input.artifacts, artifact, join(this.directory, relativePath));
      return { kind: "build-file", path: relativePath, size: artifact.size, mediaType: artifact.mediaType };
    };
    const convert = async (value: unknown, preferredName: string): Promise<BuildResultJsonValue> => {
      if (isBlobRef(value)) return await materialize(value, preferredName);
      if (scalar(value)) return value;
      if (Array.isArray(value)) {
        return await Promise.all(value.map(async (item, index) => await convert(item, `${preferredName}-${index + 1}`)));
      }
      assert(typeof value === "object", `Build Output ${preferredName} contains a non-canonical value`);
      return Object.fromEntries(await Promise.all(Object.entries(value as Readonly<Record<string, unknown>>)
        .map(async ([key, item]) => [key, await convert(item, `${preferredName}-${key}`)] as const)));
    };
    const outputValue = async (name: string, value: StoredValue): Promise<BuildResultOutput["value"]> => {
      if (value.kind === "blob") return await materialize(value, name);
      if (scalar(value.value)) return { kind: "inline", value: value.value };
      const relativePath = join("values", valueFileName(name));
      await writeJsonAtomic(join(this.directory, relativePath), await convert(value.value, name));
      return { kind: "json", path: relativePath };
    };
    const reuses = new Map(writer.reuses.map((item) => [item.candidate, item]));
    const outputRank = (record: TypedRecord, reused: { readonly build: string; readonly output: string } | undefined): number => reused !== undefined
      ? 0
      : record.value.kind === "blob" ? 1 : scalar(record.value.value) ? 2 : 3;
    const ready = writer.aliases.flatMap((alias) => {
      const record = outputRecord(input.state, alias.output);
      if (record === undefined) return [];
      const reused = reuses.get(outputCandidate(input.state, alias.output) ?? "");
      return [{ alias, record, reused }];
    }).sort((left, right) => {
      return outputRank(left.record, left.reused) - outputRank(right.record, right.reused)
        || left.alias.name.localeCompare(right.alias.name);
    });
    for (const { alias, record, reused } of ready) {
      const value: BuildResultOutput["value"] = reused === undefined
        ? await outputValue(alias.name, record.value)
        : {
            kind: "build-output",
            build: reused.build,
            output: reused.output,
          } satisfies HistoricalBuildOutputRef;
      outputs[alias.name] = { type: record.type, value };
    }
    const now = Date.now();
    const status = input.state.status === "complete"
      ? "complete"
      : input.state.status === "failed" ? "failed" : manifest.status;
    const updated: BuildResultManifest = {
      ...manifest,
      updatedAt: now,
      status,
      ...(status === "running" ? {} : { finishedAt: manifest.finishedAt ?? now }),
      outputs,
    };
    await writeJsonAtomic(join(this.directory, writerStateName), {
      ...writer,
      resources: Object.fromEntries(resources),
    });
    await writeJsonAtomic(join(this.directory, manifestName), updated);
    if (status !== "running") await rm(join(this.directory, writerStateName), { force: true });
    return updated;
  }

  async finish(input: BuildResultFinish): Promise<BuildResultManifest> {
    const manifest = await this.read();
    if (manifest.status !== "running") {
      if (manifest.status !== input.status || input.failure === undefined || manifest.failure !== undefined) return manifest;
      const updated = { ...manifest, failure: input.failure, updatedAt: Date.now() };
      await writeJsonAtomic(join(this.directory, manifestName), updated);
      return updated;
    }
    const now = Date.now();
    const updated: BuildResultManifest = {
      ...manifest,
      status: input.status,
      updatedAt: now,
      finishedAt: manifest.finishedAt ?? now,
      ...(input.failure === undefined ? {} : { failure: input.failure }),
    };
    await writeJsonAtomic(join(this.directory, manifestName), updated);
    await rm(join(this.directory, writerStateName), { force: true });
    return updated;
  }
}
