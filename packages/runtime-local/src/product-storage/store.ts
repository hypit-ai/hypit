import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  decodeStoredProductPublication,
  materializeProducts,
  productFromStored,
} from "@hypit/hypit/product";
import type {
  ProductResourceSource,
  ProductHistory,
  StoredProductPublication,
} from "@hypit/hypit/product";
import { FileProductHistory, productPublicationDirectory } from "@hypit/hypit/product/node";
import type { PublicationIntent, TypedRecord } from "@hypit/hypit/protocol";

import { writeJsonAtomic, writeStreamAtomic } from "../file-storage.js";
import { decodeBuildResultJson } from "../result-storage/decode.js";
import { decodeProductPublicationWriterState } from "./decode.js";

const manifestName = "product.json";
const writerStateName = ".writer.json";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type ProductPublicationSync = {
  readonly records: readonly TypedRecord[];
  readonly resources: ProductResourceSource;
};

export type ProductPublicationWriter = {
  read(): Promise<StoredProductPublication>;
  sync(input: ProductPublicationSync): Promise<StoredProductPublication>;
  close(requireComplete: boolean): Promise<StoredProductPublication & { readonly closedAt: number }>;
};

async function readStoredPublication(directory: string): Promise<StoredProductPublication | undefined> {
  const path = join(resolve(directory), manifestName);
  const bytes = await readFile(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  return bytes === undefined
    ? undefined
    : decodeStoredProductPublication(decodeBuildResultJson(bytes, path), basename(resolve(directory)), path);
}

function encodePublication(publication: StoredProductPublication): Omit<StoredProductPublication, "publication"> {
  const { publication: _publication, ...document } = publication;
  return document;
}

export class FileProductPublication implements ProductPublicationWriter {
  readonly directory: string;

  private constructor(directory: string) {
    this.directory = resolve(directory);
  }

  static async create(
    root: string,
    publication: string,
    intent: PublicationIntent,
  ): Promise<FileProductPublication> {
    const directory = productPublicationDirectory(root, publication);
    await mkdir(dirname(directory), { recursive: true });
    const temporary = join(resolve(root), `.preparing-${publication}-${randomUUID()}`);
    await mkdir(temporary);
    try {
      await writeJsonAtomic(join(temporary, manifestName), {
        format: "hypit.product-publication@1",
        products: {},
      });
      await writeJsonAtomic(join(temporary, writerStateName), {
        resources: {},
        values: {},
        publication: intent,
      });
      await rename(temporary, directory);
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
    return new FileProductPublication(directory);
  }

  static async open(directory: string): Promise<FileProductPublication> {
    const absolute = resolve(directory);
    assert(await readStoredPublication(absolute) !== undefined, `${absolute} has no Product publication`);
    return new FileProductPublication(absolute);
  }

  async read(): Promise<StoredProductPublication> {
    const publication = await readStoredPublication(this.directory);
    assert(publication !== undefined, `${this.directory} has no Product publication`);
    return publication;
  }

  async sync(input: ProductPublicationSync): Promise<StoredProductPublication> {
    const publication = await this.read();
    if (publication.closedAt !== undefined) return publication;
    const writerPath = join(this.directory, writerStateName);
    const writer = decodeProductPublicationWriterState(
      decodeBuildResultJson(await readFile(writerPath), writerPath),
      writerPath,
    );
    const directory = this.directory;
    const updated = await materializeProducts({
      publication: writer.publication,
      products: publication.products,
      state: writer,
      records: input.records,
      resources: input.resources,
      target: {
        async writeResource(path, blob, source) {
          const stream = await source.open(blob);
          if (stream === undefined) throw new Error(`Product resource ${blob.resource} is unavailable`);
          await writeStreamAtomic(join(directory, path), stream);
        },
        async writeValue(path, document) {
          await writeJsonAtomic(join(directory, path), document);
        },
      },
    });
    if (!updated.changed) return publication;
    await writeJsonAtomic(join(this.directory, writerStateName), {
      ...updated.state,
      publication: writer.publication,
    });
    const next: StoredProductPublication = { ...publication, products: updated.products };
    await writeJsonAtomic(join(this.directory, manifestName), encodePublication(next));
    return next;
  }

  async close(requireComplete: boolean): Promise<StoredProductPublication & { readonly closedAt: number }> {
    const publication = await this.read();
    if (publication.closedAt !== undefined) return publication as StoredProductPublication & { readonly closedAt: number };
    const writerPath = join(this.directory, writerStateName);
    const writer = decodeProductPublicationWriterState(
      decodeBuildResultJson(await readFile(writerPath), writerPath),
      writerPath,
    );
    if (requireComplete) {
      const missing = writer.publication.outputs
        .map((output) => output.name)
        .filter((name) => !Object.hasOwn(publication.products, name));
      assert(missing.length === 0,
        `Product publication ${publication.publication} cannot close before Products are stored: ${missing.join(", ")}`);
    }
    const closed = { ...publication, closedAt: Date.now() };
    await writeJsonAtomic(join(this.directory, manifestName), encodePublication(closed));
    await rm(writerPath, { force: true });
    return closed;
  }
}

export class FileProductPublicationStore extends FileProductHistory implements ProductHistory {
  async create(publication: string, intent: PublicationIntent): Promise<FileProductPublication> {
    return await FileProductPublication.create(this.root, publication, intent);
  }

  async openWriter(publication: string): Promise<FileProductPublication | undefined> {
    const directory = productPublicationDirectory(this.root, publication);
    return await readStoredPublication(directory) === undefined
      ? undefined
      : await FileProductPublication.open(directory);
  }

  async removeIncomplete(publication: string): Promise<void> {
    const directory = productPublicationDirectory(this.root, publication);
    const stored = await readStoredPublication(directory);
    if (stored === undefined) return;
    assert(stored.closedAt === undefined, `Closed Product publication ${publication} cannot be removed`);
    await rm(directory, { recursive: true, force: true });
  }

  async summaries(publication: string) {
    const stored = await readStoredPublication(productPublicationDirectory(this.root, publication));
    if (stored === undefined) return {};
    return Object.fromEntries(Object.entries(stored.products).map(([name, product]) => [
      name,
      productFromStored({ publication, name }, product),
    ]));
  }
}
