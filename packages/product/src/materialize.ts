import { compareCodeUnits, isBlobRef, mapValueBlobs } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { PublicationIntent, TypedRecord } from "@hypit/generation-build";

export type ProductFileRef = {
  readonly kind: "product-file";
  readonly path: string;
  readonly size: number;
  readonly mediaType: string;
};

export type ProductValuePath = readonly (string | number)[];

export type ProductValueDocument = {
  readonly format: "hypit.product-value@1";
  readonly value: CanonicalValue;
  readonly resources: readonly {
    readonly at: ProductValuePath;
    readonly file: ProductFileRef;
  }[];
};

export type StoredProduct = {
  readonly type: TypeRef;
  readonly publisher: string;
  readonly publicationParameters?: CanonicalValue;
  readonly value:
    | ProductFileRef
    | { readonly kind: "inline"; readonly value: null | boolean | number | string }
    | { readonly kind: "value"; readonly path: string };
};

export type ProductMaterializationState = {
  readonly resources: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<string, string>>;
};

export type ProductResourceSource = {
  open(blob: BlobRef): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export type ProductMaterializationTarget = {
  writeResource(path: string, blob: BlobRef, source: ProductResourceSource): Promise<void>;
  writeValue(path: string, document: ProductValueDocument): Promise<void>;
};

/** Validate one repository-private path without assigning a filesystem implementation. */
export function assertProductPath(value: unknown, subject: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`${subject} is not a Product-relative path`);
  }
}

export function assertProductFileRef(value: unknown, subject: string): asserts value is ProductFileRef {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`${subject} is not a Product file reference`);
  }
  const item = value as Readonly<Record<string, unknown>>;
  if (item.kind !== "product-file"
    || typeof item.size !== "number" || !Number.isSafeInteger(item.size) || item.size < 0
    || typeof item.mediaType !== "string" || item.mediaType.length === 0) {
    throw new Error(`${subject} is not a valid Product file reference`);
  }
  assertProductPath(item.path, `${subject}.path`);
}

type PathAllocator = {
  next: number;
  readonly occupied: Set<string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pathAllocator(directory: "files" | "values", stem: "file" | "value", paths: Iterable<string>): PathAllocator {
  const occupied = new Set(paths);
  const prefix = `${directory}/${stem}-`;
  let highest = 0;
  for (const path of occupied) {
    if (!path.startsWith(prefix)) continue;
    const match = /^(\d+)\.[^/]+$/u.exec(path.slice(prefix.length));
    if (match === null) continue;
    const index = Number(match[1]);
    assert(Number.isSafeInteger(index), `Product path ${path} has an unsafe generated index`);
    highest = Math.max(highest, index);
  }
  assert(highest < Number.MAX_SAFE_INTEGER, `Product ${directory} path index is exhausted`);
  return { next: highest + 1, occupied };
}

function allocatePath(
  directory: "files" | "values",
  stem: "file" | "value",
  extension: string,
  allocator: PathAllocator,
): string {
  while (true) {
    assert(Number.isSafeInteger(allocator.next), `Product ${directory} path index is exhausted`);
    const candidate = `${directory}/${stem}-${String(allocator.next).padStart(4, "0")}${extension}`;
    allocator.next += 1;
    if (allocator.occupied.has(candidate)) continue;
    allocator.occupied.add(candidate);
    return candidate;
  }
}

async function runBounded<T>(values: readonly T[], perform: (value: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  let failure: unknown;
  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = next;
      next += 1;
      if (index >= values.length) return;
      try {
        await perform(values[index]!);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, values.length) }, worker));
  if (failed) throw failure;
}

function extension(mediaType: string): string {
  const subtype = mediaType.split("/", 2)[1]?.split(";", 1)[0]?.trim().toLowerCase();
  if (subtype === undefined || subtype.length === 0) return ".bin";
  const conventional = subtype === "jpeg" ? "jpg" : subtype === "x-wav" ? "wav" : subtype;
  const suffix = conventional.includes("+") ? conventional.slice(0, conventional.indexOf("+")) : conventional;
  const safe = suffix.replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  return safe.length === 0 ? ".bin" : `.${safe}`;
}

function scalar(value: unknown): value is null | boolean | number | string {
  return value === null || typeof value === "boolean" || typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value));
}

/**
 * Materialize completed typed products without knowing their model, Type semantics or repository.
 * The caller owns publication discovery and the physical target; Product owns value/file encoding.
 */
export async function materializeProducts(input: {
  readonly publication: PublicationIntent;
  readonly products: Readonly<Record<string, StoredProduct>>;
  readonly state: ProductMaterializationState;
  readonly records: readonly TypedRecord[];
  readonly resources: ProductResourceSource;
  readonly target: ProductMaterializationTarget;
}): Promise<{
  readonly changed: boolean;
  readonly products: Readonly<Record<string, StoredProduct>>;
  readonly state: ProductMaterializationState;
}> {
  const resources = new Map(Object.entries(input.state.resources));
  const values = new Map(Object.entries(input.state.values));
  const filePaths = pathAllocator("files", "file", resources.values());
  const valuePaths = pathAllocator("values", "value", values.values());
  const products: Record<string, StoredProduct> = { ...input.products };

  const files = async (blobs: readonly BlobRef[]): Promise<readonly ProductFileRef[]> => {
    const writes: Array<{ readonly path: string; readonly blob: BlobRef }> = [];
    const result = blobs.map((blob): ProductFileRef => {
      let path = resources.get(blob.resource);
      if (path === undefined) {
        path = allocatePath("files", "file", extension(blob.mediaType), filePaths);
        resources.set(blob.resource, path);
        writes.push({ path, blob });
      }
      return { kind: "product-file", path, size: blob.size, mediaType: blob.mediaType };
    });
    await runBounded(writes, async ({ path, blob }) => {
      await input.target.writeResource(path, blob, input.resources);
    });
    return result;
  };

  const value = async (record: TypedRecord): Promise<StoredProduct["value"]> => {
    if (isBlobRef(record.value)) return (await files([record.value]))[0]!;
    if (scalar(record.value)) return { kind: "inline", value: record.value };
    const existing = values.get(record.id);
    if (existing !== undefined) return { kind: "value", path: existing };
    const path = allocatePath("values", "value", ".json", valuePaths);
    values.set(record.id, path);
    const blobs: Array<{ readonly at: ProductValuePath; readonly blob: BlobRef }> = [];
    const encoded = mapValueBlobs(record.value, (blob, at) => {
      blobs.push({ at, blob });
      return null;
    }) as CanonicalValue;
    const materialized = await files(blobs.map((item) => item.blob));
    await input.target.writeValue(path, {
      format: "hypit.product-value@1",
      value: encoded,
      resources: blobs.map((item, index) => ({ at: item.at, file: materialized[index]! })),
    });
    return { kind: "value", path };
  };

  const ready = input.publication.outputs.flatMap((publication) => {
    if (Object.hasOwn(products, publication.name)) return [];
    const record = input.records.find((item) => item.id === publication.record);
    return record === undefined ? [] : [{ publication, record }];
  }).sort((left, right) => compareCodeUnits(left.publication.name, right.publication.name));

  for (const { publication, record } of ready) {
    Object.defineProperty(products, publication.name, {
      value: {
        type: record.type,
        publisher: publication.publisher,
        ...(publication.parameters === undefined ? {} : { publicationParameters: publication.parameters }),
        value: await value(record),
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return {
    changed: ready.length > 0,
    products,
    state: { resources: Object.fromEntries(resources), values: Object.fromEntries(values) },
  };
}
