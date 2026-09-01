import type {
  BuildResultFileRef,
  BuildResultFinish,
  BuildResultJsonValue,
  BuildResultManifest,
  BuildResultOutput,
  BuildResultRepository,
  BuildResultSeed,
  BuildResultSync,
  BuildResultWriter,
  HistoricalBuildOutputRef,
  RepositoryBuildResultOutput,
} from "@hypit/build-result";
import type { BlobRef, BuildState, StoredValue, TypedRecord } from "@hypit/protocol";

import { AwsBuildResultS3Client } from "./client.js";
import type { AwsBuildResultS3ClientOptions, BuildResultS3Client } from "./client.js";

type WriterState = {
  readonly resources: Readonly<Record<string, string>>;
  readonly aliases: readonly {
    readonly name: string;
    readonly output: string;
  }[];
  readonly reuses: readonly {
    readonly candidate: string;
    readonly build: string;
    readonly output: string;
  }[];
};

export type S3BuildResultRepositoryOptions = AwsBuildResultS3ClientOptions & {
  readonly prefix?: string;
  readonly client?: BuildResultS3Client;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizePrefix(value: string | undefined): string {
  if (value === undefined || value.length === 0) return "";
  const normalized = value.replace(/^\/+|\/+$/gu, "");
  assert(normalized.length > 0 && !normalized.split("/").some((part) => part === "." || part === ".."), "S3 Build Result prefix is invalid");
  return normalized;
}

function safeBuild(build: string): string {
  assert(build.trim().length > 0 && !build.includes("/") && !build.includes("\\"), "Build id is not a repository name");
  return build;
}

function safePath(path: string): string {
  assert(path.length > 0 && !path.startsWith("/") && !path.includes("\\"), "Build Result path must be relative");
  assert(!path.split("/").some((part) => part.length === 0 || part === "." || part === ".."), `Build Result path ${path} is invalid`);
  return path;
}

function safeName(value: string): string {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
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

function scalar(value: unknown): value is null | boolean | number | string {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

function isBlobRef(value: unknown): value is BlobRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.kind === "blob" && typeof item.digest === "string" && typeof item.size === "number" && typeof item.mediaType === "string";
}

function resourceIdentity(artifact: BlobRef): string {
  assert(artifact.resource !== undefined, "Build resource has no instance identity; the producing Store must return BlobRef.resource");
  return artifact.resource;
}

function outputRecord(state: BuildState, output: string): TypedRecord | undefined {
  const selection = state.plan.selections.find((item) => item.output === output);
  return selection === undefined ? undefined : state.records.find((item) => item.id === selection.record);
}

function outputCandidate(state: BuildState, output: string): string | undefined {
  return state.plan.selections.find((item) => item.output === output)?.candidate;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function decodeJson<T>(value: Uint8Array, subject: string): T {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value)) as T;
  } catch (error) {
    throw new Error(`${subject} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

class S3BuildResultWriter implements BuildResultWriter {
  readonly #repository: S3BuildResultRepository;
  readonly #build: string;

  constructor(repository: S3BuildResultRepository, build: string) {
    this.#repository = repository;
    this.#build = build;
  }

  async read(): Promise<BuildResultManifest> {
    const manifest = await this.#repository.read(this.#build);
    assert(manifest !== undefined, `Build Result ${this.#build} does not exist`);
    return manifest;
  }

  async sync(input: BuildResultSync): Promise<BuildResultManifest> {
    const manifest = await this.read();
    if (manifest.status !== "running") return manifest;
    const writer = await this.#repository.readWriter(this.#build);
    assert(writer !== undefined, `Build Result ${this.#build} has no writer state`);
    const resources = new Map(Object.entries(writer.resources));
    const outputs: Record<string, BuildResultOutput> = { ...manifest.outputs };
    const materialize = async (artifact: BlobRef, preferredName: string): Promise<BuildResultFileRef> => {
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
      let path = resources.get(identity);
      if (path === undefined) {
        const base = safeName(preferredName);
        let candidate = `files/${base}${mediaExtension(artifact.mediaType)}`;
        let counter = 2;
        const occupied = new Set(resources.values());
        while (occupied.has(candidate)) {
          candidate = `files/${base}-${counter}${mediaExtension(artifact.mediaType)}`;
          counter += 1;
        }
        path = candidate;
        resources.set(identity, path);
        const chunks = await input.artifacts.open(artifact);
        if (chunks === undefined) throw new Error(`Build resource ${identity} is unavailable`);
        await this.#repository.writeFile(this.#build, path, chunks, artifact.mediaType);
      }
      return {
        kind: "build-file",
        path,
        size: artifact.size,
        mediaType: artifact.mediaType,
      };
    };
    const convert = async (value: unknown, preferredName: string): Promise<BuildResultJsonValue> => {
      if (isBlobRef(value)) return await materialize(value, preferredName);
      if (scalar(value)) return value;
      if (Array.isArray(value)) {
        return await Promise.all(value.map(async (item, index) => await convert(item, `${preferredName}-${index + 1}`)));
      }
      assert(typeof value === "object", `Build Output ${preferredName} contains a non-canonical value`);
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value as Readonly<Record<string, unknown>>).map(async ([key, item]) => [key, await convert(item, `${preferredName}-${key}`)] as const),
        ),
      );
    };
    const outputValue = async (name: string, value: StoredValue): Promise<BuildResultOutput["value"]> => {
      if (value.kind === "blob") return await materialize(value, name);
      if (scalar(value.value)) return { kind: "inline", value: value.value };
      const path = `values/${valueFileName(name)}`;
      await this.#repository.writeJson(this.#build, path, await convert(value.value, name));
      return { kind: "json", path };
    };
    const reuses = new Map(writer.reuses.map((item) => [item.candidate, item]));
    const outputRank = (record: TypedRecord, reused: { readonly build: string; readonly output: string } | undefined): number =>
      reused !== undefined ? 0 : record.value.kind === "blob" ? 1 : scalar(record.value.value) ? 2 : 3;
    const ready = writer.aliases
      .flatMap((alias) => {
        const record = outputRecord(input.state, alias.output);
        if (record === undefined) return [];
        const reused = reuses.get(outputCandidate(input.state, alias.output) ?? "");
        return [{ alias, record, reused }];
      })
      .sort((left, right) => {
        return outputRank(left.record, left.reused) - outputRank(right.record, right.reused) || left.alias.name.localeCompare(right.alias.name);
      });
    for (const { alias, record, reused } of ready) {
      const value: BuildResultOutput["value"] =
        reused === undefined
          ? await outputValue(alias.name, record.value)
          : ({
              kind: "build-output",
              build: reused.build,
              output: reused.output,
            } satisfies HistoricalBuildOutputRef);
      outputs[alias.name] = { type: record.type, value };
    }
    const now = Date.now();
    const status = input.state.status === "complete" ? "complete" : input.state.status === "failed" ? "failed" : manifest.status;
    const updated: BuildResultManifest = {
      ...manifest,
      updatedAt: now,
      status,
      ...(status === "running" ? {} : { finishedAt: manifest.finishedAt ?? now }),
      outputs,
    };
    await this.#repository.writeWriter(this.#build, {
      ...writer,
      resources: Object.fromEntries(resources),
    });
    await this.#repository.writeManifest(this.#build, updated);
    if (status !== "running") await this.#repository.deleteWriter(this.#build);
    return updated;
  }

  async finish(input: BuildResultFinish): Promise<BuildResultManifest> {
    const manifest = await this.read();
    if (manifest.status !== "running") {
      if (manifest.status !== input.status || input.failure === undefined || manifest.failure !== undefined) return manifest;
      const updated = {
        ...manifest,
        failure: input.failure,
        updatedAt: Date.now(),
      };
      await this.#repository.writeManifest(this.#build, updated);
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
    await this.#repository.writeManifest(this.#build, updated);
    await this.#repository.deleteWriter(this.#build);
    return updated;
  }
}

export class S3BuildResultRepository implements BuildResultRepository {
  readonly #client: BuildResultS3Client;
  readonly #prefix: string;

  constructor(options: S3BuildResultRepositoryOptions) {
    assert(options.bucket.trim().length > 0, "S3 Build Result bucket must not be empty");
    this.#prefix = normalizePrefix(options.prefix);
    this.#client = options.client ?? new AwsBuildResultS3Client(options);
  }

  #key(build: string, path: string): string {
    const relative = `${safeBuild(build)}/${safePath(path)}`;
    return this.#prefix.length === 0 ? relative : `${this.#prefix}/${relative}`;
  }

  async #readJson<T>(build: string, path: string): Promise<T | undefined> {
    const bytes = await this.#client.get(this.#key(build, path));
    return bytes === undefined ? undefined : decodeJson<T>(bytes, `${build}/${path}`);
  }

  async writeJson(build: string, path: string, value: unknown): Promise<void> {
    await this.#client.put(this.#key(build, path), encodeJson(value), "application/json");
  }

  async writeFile(build: string, path: string, chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<void> {
    await this.#client.putStream(this.#key(build, path), chunks, mediaType);
  }

  async writeManifest(build: string, manifest: BuildResultManifest): Promise<void> {
    await this.writeJson(build, "result.json", manifest);
  }

  async readWriter(build: string): Promise<WriterState | undefined> {
    return await this.#readJson<WriterState>(build, ".writer.json");
  }

  async writeWriter(build: string, state: WriterState): Promise<void> {
    await this.writeJson(build, ".writer.json", state);
  }

  async deleteWriter(build: string): Promise<void> {
    await this.#client.delete(this.#key(build, ".writer.json"));
  }

  async create(seed: BuildResultSeed): Promise<BuildResultWriter> {
    assert((await this.read(seed.id)) === undefined, `Build Result ${seed.id} already exists`);
    assert(seed.name === undefined || seed.name.trim().length > 0, "Build Result name must not be empty");
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
    await this.writeManifest(seed.id, manifest);
    await this.writeWriter(seed.id, {
      resources: {},
      aliases: seed.aliases,
      reuses: seed.reuses ?? [],
    });
    return new S3BuildResultWriter(this, seed.id);
  }

  async openWriter(build: string): Promise<BuildResultWriter | undefined> {
    return (await this.read(build)) === undefined ? undefined : new S3BuildResultWriter(this, build);
  }

  async read(build: string): Promise<BuildResultManifest | undefined> {
    const manifest = await this.#readJson<BuildResultManifest>(build, "result.json");
    if (manifest !== undefined) assert(manifest.format === "hypit.build-result@1", `${build}/result.json is not a Build Result`);
    return manifest;
  }

  async list(): Promise<readonly BuildResultManifest[]> {
    const prefix = this.#prefix.length === 0 ? "" : `${this.#prefix}/`;
    const suffix = "/result.json";
    const builds = (await this.#client.list(prefix)).flatMap((key) => {
      if (!key.startsWith(prefix) || !key.endsWith(suffix)) return [];
      const build = key.slice(prefix.length, -suffix.length);
      return build.length > 0 && !build.includes("/") ? [build] : [];
    });
    const manifests = (await Promise.all([...new Set(builds)].map(async (build) => await this.read(build)))).filter(
      (item): item is BuildResultManifest => item !== undefined,
    );
    return manifests.sort((left, right) => right.startedAt - left.startedAt || left.id.localeCompare(right.id));
  }

  async resolve(build: string, output: string): Promise<RepositoryBuildResultOutput | undefined> {
    const seen = new Set<string>();
    let currentBuild = build;
    let currentOutput = output;
    while (true) {
      const address = `${currentBuild}\u0000${currentOutput}`;
      assert(!seen.has(address), `Build Output forwarding repeats ${currentBuild} / ${currentOutput}`);
      seen.add(address);
      const manifest = await this.read(currentBuild);
      const entry = manifest?.outputs[currentOutput];
      if (entry === undefined) return undefined;
      if (entry.value.kind === "build-output") {
        currentBuild = entry.value.build;
        currentOutput = entry.value.output;
        continue;
      }
      if (entry.value.kind === "json") {
        const value = await this.#readJson<BuildResultJsonValue>(currentBuild, entry.value.path);
        assert(value !== undefined, `Build ${currentBuild} value ${entry.value.path} is unavailable`);
        return {
          build: currentBuild,
          output: currentOutput,
          type: entry.type,
          value: { ...entry.value, value },
        };
      }
      return {
        build: currentBuild,
        output: currentOutput,
        type: entry.type,
        value: entry.value,
      };
    }
  }

  async openFile(build: string, file: BuildResultFileRef): Promise<AsyncIterable<Uint8Array> | undefined> {
    return await this.#client.open(this.#key(file.build ?? build, file.path));
  }

  async close(): Promise<void> {
    await this.#client.close?.();
  }
}
