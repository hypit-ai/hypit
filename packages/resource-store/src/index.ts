import type { BlobRef, ResourceId } from "@hypit/protocol";

export type ResourceIOOptions = {
  /** Cancel transfer and discard unfinished writes before rejecting. */
  readonly signal?: AbortSignal;
};

export type ResourceStore = {
  /** Store one new resource instance. Equal bytes remain independent resources. */
  put(bytes: Uint8Array, mediaType: string, options?: ResourceIOOptions): Promise<BlobRef>;
  /** Write bytes for one resource already declared by the caller. */
  write(resource: BlobRef, bytes: Uint8Array, options?: ResourceIOOptions): Promise<void>;
  get(resource: ResourceId, options?: ResourceIOOptions): Promise<Uint8Array | undefined>;
  has(resource: ResourceId, options?: ResourceIOOptions): Promise<boolean>;
};

export type StreamingResourceStore = ResourceStore & {
  putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string, options?: ResourceIOOptions): Promise<BlobRef>;
  writeStream(resource: BlobRef, chunks: AsyncIterable<Uint8Array>, options?: ResourceIOOptions): Promise<void>;
  open(resource: ResourceId, options?: ResourceIOOptions): Promise<AsyncIterable<Uint8Array> | undefined>;
};

export function isStreamingResourceStore(value: ResourceStore): value is StreamingResourceStore {
  return "putStream" in value && typeof value.putStream === "function"
    && "writeStream" in value && typeof value.writeStream === "function"
    && "open" in value && typeof value.open === "function";
}

export class MemoryResourceStore implements ResourceStore {
  readonly #values = new Map<ResourceId, Uint8Array>();

  async put(bytes: Uint8Array, mediaType: string, options: ResourceIOOptions = {}): Promise<BlobRef> {
    options.signal?.throwIfAborted();
    const copy = Uint8Array.from(bytes);
    const resource = `res_${crypto.randomUUID()}` as ResourceId;
    this.#values.set(resource, copy);
    return { kind: "blob", resource, size: copy.byteLength, mediaType };
  }

  async write(resource: BlobRef, bytes: Uint8Array, options: ResourceIOOptions = {}): Promise<void> {
    options.signal?.throwIfAborted();
    const copy = Uint8Array.from(bytes);
    if (copy.byteLength !== resource.size) {
      throw new Error(`Resource ${resource.resource} has size ${copy.byteLength}, expected ${resource.size}`);
    }
    if (!this.#values.has(resource.resource)) this.#values.set(resource.resource, copy);
  }

  async get(resource: ResourceId, options: ResourceIOOptions = {}): Promise<Uint8Array | undefined> {
    options.signal?.throwIfAborted();
    const value = this.#values.get(resource);
    return value === undefined ? undefined : Uint8Array.from(value);
  }

  async has(resource: ResourceId, options: ResourceIOOptions = {}): Promise<boolean> {
    options.signal?.throwIfAborted();
    return this.#values.has(resource);
  }
}
