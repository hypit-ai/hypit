import { preserveExecutionLog } from "./execution-log.js";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { assertOrderedBuildId } from "@hypit/generation-build";
import { buildResultDirectory } from "@hypit/result/node";
import { productFromStored } from "@hypit/product";

import type {
  BuildFinalizationFinish,
  BuildResultDraft,
  BuildFinalizationSeed,
  BuildFinalizationSync,
  BuildFinalizationStore,
  StoredBuildResult,
  StoredFinishedBuildResult,
} from "./types.js";
import { assertBuildFinalizationSeed } from "./types.js";
import {
  decodeBuildResultJson,
  decodeStoredBuildResult,
  encodeStoredBuildResult,
} from "./decode.js";
import { writeJsonAtomic, writeStreamAtomic } from "../file-storage.js";
import { FileProductPublicationStore } from "../product-storage/store.js";
import type { ProductPublicationWriter } from "../product-storage/store.js";

const manifestName = "result.json";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function writeManifestAtomic(path: string, manifest: StoredBuildResult): Promise<void> {
  await writeJsonAtomic(path, encodeStoredBuildResult(manifest));
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

export class FileBuildFinalization {
  readonly directory: string;
  readonly #products: ProductPublicationWriter;

  private constructor(directory: string, products: ProductPublicationWriter) {
    this.directory = resolve(directory);
    this.#products = products;
  }

  static async create(
    root: string,
    productRoot: string,
    seed: BuildFinalizationSeed,
  ): Promise<FileBuildFinalization> {
    assertOrderedBuildId(seed.id);
    assertBuildFinalizationSeed(seed);
    const publication = seed.publication;
    const productStore = new FileProductPublicationStore(productRoot);
    const products = await productStore.create(seed.id, publication);
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
      await rename(temporary, directory);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      await productStore.removeIncomplete(seed.id).catch(() => undefined);
      throw error;
    }
    return new FileBuildFinalization(directory, products);
  }

  static async open(
    directory: string,
    productStore: FileProductPublicationStore,
  ): Promise<FileBuildFinalization> {
    const absolute = resolve(directory);
    const manifest = await readStoredBuildResult(absolute);
    if (manifest === undefined) throw new Error(`${absolute} has no Build Result`);
    const products = await productStore.openWriter(manifest.id);
    assert(products !== undefined, `${absolute} has no Product publication`);
    return new FileBuildFinalization(absolute, products);
  }

  async read(): Promise<StoredBuildResult> {
    const manifest = await readStoredBuildResult(this.directory);
    assert(manifest !== undefined, `${this.directory} has no Build Result`);
    return manifest;
  }

  async sync(input: BuildFinalizationSync): Promise<StoredBuildResult> {
    const manifest = await this.read();
    if ("outcome" in manifest) return manifest;
    const products = await this.#products.sync(input);
    if (Object.keys(products.products).length === Object.keys(manifest.outputs).length) return manifest;
    const outputs = Object.fromEntries(Object.entries(products.products).map(([name, product]) => [
      name,
      productFromStored({ publication: manifest.id, name }, product),
    ]));
    const updated = { ...manifest, outputs };
    await writeManifestAtomic(join(this.directory, manifestName), updated);
    return updated;
  }

  async finish(input: BuildFinalizationFinish): Promise<StoredFinishedBuildResult> {
    const manifest = await this.read();
    if ("outcome" in manifest) {
      assert(manifest.outcome === input.outcome && manifest.failure === input.failure,
        `Build Result ${manifest.id} is already finished with a different outcome`);
      return manifest;
    }
    const products = await this.#products.close(input.outcome === "complete");
    const outputs = Object.fromEntries(Object.entries(products.products).map(([name, product]) => [
      name,
      productFromStored({ publication: manifest.id, name }, product),
    ]));
    const executionLog = await preserveExecutionLog(input.executionLog,
      async (path, chunks) => await writeStreamAtomic(join(this.directory, path), chunks));
    const now = Date.now();
    const evidence = {
      ...manifest,
      outputs,
      ...(executionLog === undefined ? {} : { executionLog }),
      ...(input.operations === undefined ? {} : { operations: input.operations }),
      finishedAt: now,
    };
    const updated: StoredFinishedBuildResult = input.outcome === "complete"
      ? { ...evidence, outcome: "complete" }
      : { ...evidence, outcome: input.outcome, failure: input.failure };
    await writeManifestAtomic(join(this.directory, manifestName), updated);
    return updated;
  }
}

/** Runtime-only writable publication and recovery store. */
export class FileBuildFinalizationStore implements BuildFinalizationStore {
  readonly root: string;
  readonly #products: FileProductPublicationStore;

  constructor(root: string, productRoot: string) {
    this.root = resolve(root);
    this.#products = new FileProductPublicationStore(productRoot);
  }

  async create(seed: BuildFinalizationSeed): Promise<FileBuildFinalization> {
    return await FileBuildFinalization.create(this.root, this.#products.root, seed);
  }

  async openFinalizer(build: string): Promise<FileBuildFinalization | undefined> {
    const directory = buildResultDirectory(this.root, build);
    return await readStoredBuildResult(directory) === undefined
      ? undefined
      : await FileBuildFinalization.open(directory, this.#products);
  }

  async removeIncomplete(build: string): Promise<void> {
    const manifest = await this.readStored(build);
    if (manifest === undefined) return;
    assert(manifest.outcome === undefined, `Finished Build Result ${build} cannot be removed`);
    await this.#products.removeIncomplete(build);
    await rm(buildResultDirectory(this.root, build), { recursive: true, force: true });
  }

  async readStored(build: string): Promise<StoredBuildResult | undefined> {
    return await readStoredBuildResult(buildResultDirectory(this.root, build));
  }

}
