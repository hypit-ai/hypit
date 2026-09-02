import type {
  BuildResultFileRef,
  BuildResultFileRange,
  BuildResultFinish,
  BuildResultManifest,
  BuildResultPresentationUpdate,
  BuildResultRepository,
  BuildResultSeed,
  BuildResultSync,
  BuildResultWriter,
  BuildResultWriterState,
  RepositoryBuildResultOutput,
  RepositoryBuildResultOutputDescription,
} from "@hypit/build-result";
import {
  applyBuildResultPresentation,
  assertBuildResultSeed,
  decodeBuildResultJson,
  decodeBuildResultManifest,
  decodeBuildResultValueDocument,
  decodeBuildResultWriterState,
  encodeBuildResultManifest,
  normalizeBuildResultForwards,
  syncBuildResultOutputs,
} from "@hypit/build-result";
import { assertOrderedBuildId, buildIdCreatedAt } from "@hypit/protocol";

import { AwsBuildResultS3Client } from "./client.js";
import type { AwsBuildResultS3ClientOptions, BuildResultS3Client } from "./client.js";

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

function physicalBuild(build: string): string {
  assertOrderedBuildId(build);
  const createdAt = buildIdCreatedAt(build)!;
  const descendingTime = (Number.MAX_SAFE_INTEGER - createdAt).toString().padStart(16, "0");
  return `${descendingTime}-${build}`;
}

function publicBuild(physical: string): string | undefined {
  if (!/^\d{16}-bld_/u.test(physical)) return undefined;
  const build = physical.slice(17);
  return buildIdCreatedAt(build) === undefined || physicalBuild(build) !== physical ? undefined : build;
}

function safePath(path: string): string {
  assert(path.length > 0 && !path.startsWith("/") && !path.includes("\\"), "Build Result path must be relative");
  assert(!path.split("/").some((part) => part.length === 0 || part === "." || part === ".."), `Build Result path ${path} is invalid`);
  return path;
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
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
    if (manifest.outcome !== undefined) return manifest;
    const writer = await this.#repository.readWriter(this.#build);
    assert(writer !== undefined, `Build Result ${this.#build} has no writer state`);
    const updated = await syncBuildResultOutputs({
      manifest,
      writer,
      sync: input,
      target: {
        writeResource: async (path, artifact, source) => {
          const chunks = await source.open(artifact);
          if (chunks === undefined) throw new Error(`Build resource ${artifact.resource} is unavailable`);
          await this.#repository.writeFile(this.#build, path, chunks, artifact.mediaType);
        },
        writeValue: async (path, document) => {
          await this.#repository.writeJson(this.#build, path, document);
        },
      },
    });
    await this.#repository.writeWriter(this.#build, updated.writer);
    await this.#repository.writeManifest(this.#build, updated.manifest);
    return updated.manifest;
  }

  async finish(input: BuildResultFinish): Promise<BuildResultManifest> {
    const manifest = await this.read();
    if (manifest.outcome !== undefined) {
      assert(manifest.outcome === input.outcome && manifest.failure === input.failure,
        `Build Result ${manifest.id} is already finished with a different outcome`);
      await this.#repository.deleteWriter(this.#build);
      return manifest;
    }
    const now = Date.now();
    const updated: BuildResultManifest = {
      ...manifest,
      outcome: input.outcome,
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
    const relative = `${physicalBuild(build)}/${safePath(path)}`;
    return this.#prefix.length === 0 ? relative : `${this.#prefix}/${relative}`;
  }

  async #readJson(build: string, path: string): Promise<unknown | undefined> {
    const bytes = await this.#client.get(this.#key(build, path));
    return bytes === undefined ? undefined : decodeBuildResultJson(bytes, `${build}/${path}`);
  }

  async writeJson(build: string, path: string, value: unknown): Promise<void> {
    await this.#client.put(this.#key(build, path), encodeJson(value), "application/json");
  }

  async writeFile(build: string, path: string, chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<void> {
    await this.#client.putStream(this.#key(build, path), chunks, mediaType);
  }

  async writeManifest(build: string, manifest: BuildResultManifest): Promise<void> {
    await this.writeJson(build, "result.json", encodeBuildResultManifest(manifest));
  }

  async readWriter(build: string): Promise<BuildResultWriterState | undefined> {
    const subject = `${build}/.writer.json`;
    const value = await this.#readJson(build, ".writer.json");
    return value === undefined ? undefined : decodeBuildResultWriterState(value, subject);
  }

  async writeWriter(build: string, state: BuildResultWriterState): Promise<void> {
    await this.writeJson(build, ".writer.json", state);
  }

  async deleteWriter(build: string): Promise<void> {
    await this.#client.delete(this.#key(build, ".writer.json"));
  }

  async create(seed: BuildResultSeed): Promise<BuildResultWriter> {
    assertOrderedBuildId(seed.id);
    assertBuildResultSeed(seed);
    assert((await this.read(seed.id)) === undefined, `Build Result ${seed.id} already exists`);
    const forwards = await normalizeBuildResultForwards(this, seed.forwards ?? []);
    const manifest: BuildResultManifest = {
      format: "hypit.build-result@2",
      id: seed.id,
      ...(seed.title === undefined ? {} : { title: seed.title }),
      source: seed.source,
      ...(seed.run === undefined ? {} : { run: seed.run }),
      targets: [...seed.targets],
      outputs: {},
    };
    try {
      await this.writeWriter(seed.id, {
        resources: {},
        values: {},
        publishedOutputs: seed.publishedOutputs,
        forwards,
      });
      await this.writeManifest(seed.id, manifest);
    } catch (error) {
      await this.#client.delete(this.#key(seed.id, ".writer.json")).catch(() => undefined);
      await this.#client.delete(this.#key(seed.id, "result.json")).catch(() => undefined);
      throw error;
    }
    return new S3BuildResultWriter(this, seed.id);
  }

  async openWriter(build: string): Promise<BuildResultWriter | undefined> {
    return (await this.read(build)) === undefined ? undefined : new S3BuildResultWriter(this, build);
  }

  async removeIncomplete(build: string): Promise<void> {
    const manifest = await this.read(build);
    if (manifest === undefined) return;
    assert(manifest.outcome === undefined, `Finished Build Result ${build} cannot be removed`);
    const prefix = this.#key(build, "result.json").slice(0, -"result.json".length);
    const keys = await this.#client.list(prefix);
    await Promise.all(keys.filter((key) => key.startsWith(prefix)).map(async (key) => await this.#client.delete(key)));
  }

  async read(build: string): Promise<BuildResultManifest | undefined> {
    const subject = `${build}/result.json`;
    const value = await this.#readJson(build, "result.json");
    return value === undefined ? undefined : decodeBuildResultManifest(value, build, subject);
  }

  async updatePresentation(
    build: string,
    update: BuildResultPresentationUpdate,
  ): Promise<BuildResultManifest> {
    const manifest = await this.read(build);
    assert(manifest !== undefined, `Build Result ${build} does not exist`);
    const updated = applyBuildResultPresentation(manifest, update);
    await this.writeManifest(build, updated);
    return updated;
  }

  async browse(request: { readonly before?: string; readonly limit: number }) {
    assert(Number.isSafeInteger(request.limit) && request.limit > 0, "Build Result browse limit must be positive");
    if (request.before !== undefined) assertOrderedBuildId(request.before);
    const prefix = this.#prefix.length === 0 ? "" : `${this.#prefix}/`;
    const found: Array<BuildResultManifest & { readonly outcome: NonNullable<BuildResultManifest["outcome"]>; readonly finishedAt: number }> = [];
    let after = request.before === undefined ? undefined : `${prefix}${physicalBuild(request.before)}/`;
    while (found.length <= request.limit) {
      const page = await this.#client.list(prefix, {
        limit: Math.min(1_000, Math.max(32, request.limit + 1)),
        delimiter: "/",
        ...(after === undefined ? {} : { after }),
      });
      if (page.length === 0) break;
      for (const item of page) {
        after = item;
        if (!item.startsWith(prefix) || !item.endsWith("/")) continue;
        const physical = item.slice(prefix.length, -1);
        if (physical.includes("/")) continue;
        const build = publicBuild(physical);
        if (build === undefined) continue;
        const manifest = await this.read(build);
        if (manifest?.outcome === undefined || manifest.finishedAt === undefined) continue;
        found.push(manifest as typeof found[number]);
        if (found.length > request.limit) break;
      }
      if (found.length > request.limit || page.length < Math.min(1_000, Math.max(32, request.limit + 1))) break;
    }
    const results = found.slice(0, request.limit);
    return {
      results,
      ...(found.length > request.limit && results.length > 0 ? { next: results[results.length - 1]!.id } : {}),
    };
  }

  async describeOutput(build: string, output: string): Promise<RepositoryBuildResultOutputDescription | undefined> {
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
      return entry.value.kind === "build-file"
        ? { type: entry.type, kind: "resource", size: entry.value.size, mediaType: entry.value.mediaType }
        : entry.value.kind === "value"
          ? { type: entry.type, kind: "composite" }
          : { type: entry.type, kind: "scalar" };
    }
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
      if (entry.value.kind === "value") {
        const rawDocument = await this.#readJson(currentBuild, entry.value.path);
        assert(rawDocument !== undefined, `Build ${currentBuild} value ${entry.value.path} is unavailable`);
        const document = decodeBuildResultValueDocument(
          rawDocument,
          `Build ${currentBuild} Output ${currentOutput}`,
        );
        return {
          build: currentBuild,
          output: currentOutput,
          type: entry.type,
          value: { ...entry.value, document },
        };
      }
      const terminalKind = (entry.value as { readonly kind?: unknown }).kind;
      assert(terminalKind === "build-file" || terminalKind === "inline",
        `Build ${currentBuild} Output ${currentOutput} has unsupported Result value kind ${String(terminalKind)}`);
      return {
        build: currentBuild,
        output: currentOutput,
        type: entry.type,
        value: entry.value,
      };
    }
  }

  async openFile(
    build: string,
    file: BuildResultFileRef,
    range?: BuildResultFileRange,
  ): Promise<AsyncIterable<Uint8Array> | undefined> {
    if (range !== undefined) {
      assert(Number.isSafeInteger(range.start) && range.start >= 0, "Build Result file range start is invalid");
      assert(Number.isSafeInteger(range.endExclusive) && range.endExclusive > range.start,
        "Build Result file range end is invalid");
      assert(range.endExclusive <= file.size, "Build Result file range exceeds the declared file size");
    }
    return await this.#client.open(this.#key(build, file.path), range);
  }

  /** Verify that the configured bucket/prefix can be listed without loading Result history. */
  async diagnose(): Promise<void> {
    const prefix = this.#prefix.length === 0 ? "" : `${this.#prefix}/`;
    await this.#client.list(prefix, { limit: 1 });
  }

  async close(): Promise<void> {
    await this.#client.close?.();
  }
}
