import { Buffer } from "node:buffer";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, join } from "node:path";

import { assertOrderedBuildId, buildIdCreatedAt } from "@hypit/generation-build";
import type { BlobRef, CanonicalValue, Value, ValuePath } from "@hypit/protocol";
import { productAddress } from "../address.js";
import { decodeProductValueDocument, decodeStoredProductPublication } from "../decode.js";
import { productFromStored } from "../history.js";
import type { ProductAddress } from "../address.js";
import type { ProductFileRange, ProductHistory, ResolvedProduct } from "../history.js";
import type { ProductFileRef, StoredProduct } from "../materialize.js";
import type { StoredProductPublication } from "../publication.js";

const manifestName = "product.json";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function publicationBucket(publication: string): string {
  assertOrderedBuildId(publication);
  const createdAt = buildIdCreatedAt(publication);
  assert(createdAt !== undefined, `Product publication ${publication} has no ordered creation time`);
  return new Date(createdAt).toISOString().slice(0, 10);
}

export function productPublicationDirectory(root: string, publication: string): string {
  const directory = resolve(root);
  const target = resolve(directory, publicationBucket(publication), publication);
  const relation = relative(directory, target);
  assert(relation.length > 0 && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation),
    `Product publication ${publication} leaves Product root ${directory}`);
  return target;
}

async function exists(path: string): Promise<boolean> {
  return await stat(path).then((item) => item.isFile(), () => false);
}

function containedProductPath(directory: string, path: string): string {
  assert(!isAbsolute(path), `Product path ${path} must be relative`);
  const root = resolve(directory);
  const absolute = resolve(root, path);
  const relation = relative(root, absolute);
  assert(relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation),
    `Product path ${path} leaves ${root}`);
  return absolute;
}

async function readPublication(
  root: string,
  publication: string,
  closedOnly: boolean,
): Promise<StoredProductPublication | undefined> {
  const directory = productPublicationDirectory(root, publication);
  const path = join(directory, manifestName);
  const bytes = await readFile(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (bytes === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const decoded = decodeStoredProductPublication(value, publication, path);
  return closedOnly && decoded.closedAt === undefined ? undefined : decoded;
}

async function openProductFile(
  directory: string,
  file: ProductFileRef,
  range?: ProductFileRange,
): Promise<AsyncIterable<Uint8Array> | undefined> {
  const path = containedProductPath(directory, file.path);
  if (!await exists(path)) return undefined;
  if (range === undefined) return createReadStream(path);
  assert(Number.isSafeInteger(range.start) && range.start >= 0, "Product file range start is invalid");
  assert(Number.isSafeInteger(range.endExclusive) && range.endExclusive > range.start,
    "Product file range end is invalid");
  assert(range.endExclusive <= file.size, "Product file range exceeds the declared file size");
  return createReadStream(path, { start: range.start, end: range.endExclusive - 1 });
}

async function resolveStoredProduct(
  directory: string,
  address: ProductAddress,
  entry: StoredProduct,
): Promise<ResolvedProduct> {
  const resources = new Map<string, { readonly blob: BlobRef; readonly file: ProductFileRef }>();
  const boundFiles = new Map<string, BlobRef>();
  const bind = (file: ProductFileRef, index: number): BlobRef => {
    const identity = JSON.stringify([file.path, file.size, file.mediaType]);
    const existing = boundFiles.get(identity);
    if (existing !== undefined) return existing;
    const blob: BlobRef = {
      kind: "blob",
      resource: `res_product_${address.publication}_${Buffer.from(address.name, "utf8").toString("base64url")}_${index}`,
      size: file.size,
      mediaType: file.mediaType,
    };
    boundFiles.set(identity, blob);
    resources.set(blob.resource, { blob, file });
    return blob;
  };
  let value: Value;
  if (entry.value.kind === "value") {
    const path = containedProductPath(directory, entry.value.path);
    const bytes = await readFile(path);
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const document = decodeProductValueDocument(raw, `Product ${address.publication}/${address.name}`);
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
  } else if (entry.value.kind === "product-file") value = bind(entry.value, 0);
  else value = entry.value.value;
  return {
    address,
    type: entry.type,
    publisher: entry.publisher,
    ...(entry.publicationParameters === undefined ? {} : { publicationParameters: entry.publicationParameters }),
    value,
    async openResource(blob, range) {
      const owned = resources.get(blob.resource);
      if (owned === undefined || owned.blob.size !== blob.size || owned.blob.mediaType !== blob.mediaType) return undefined;
      return await openProductFile(directory, owned.file, range);
    },
  };
}

export class FileProductHistory implements ProductHistory {
  readonly root: string;

  constructor(root: string) {
    assert(root.trim().length > 0, "Product root must not be empty");
    this.root = resolve(root);
  }

  async readProduct(address: ProductAddress) {
    const publication = await readPublication(this.root, address.publication, true);
    const stored = publication === undefined || !Object.hasOwn(publication.products, address.name)
      ? undefined
      : publication.products[address.name];
    return stored === undefined ? undefined : productFromStored(address, stored);
  }

  async resolveProduct(address: ProductAddress): Promise<ResolvedProduct | undefined> {
    const publication = await readPublication(this.root, address.publication, true);
    const stored = publication === undefined || !Object.hasOwn(publication.products, address.name)
      ? undefined
      : publication.products[address.name];
    return stored === undefined
      ? undefined
      : await resolveStoredProduct(productPublicationDirectory(this.root, address.publication), productAddress(address.publication, address.name), stored);
  }
}
