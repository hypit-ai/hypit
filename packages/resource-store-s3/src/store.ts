import { randomUUID } from "node:crypto";

import { isResourceId } from "@hypit/protocol";
import type { BlobRef, ResourceId } from "@hypit/protocol";
import type { ResourceStore } from "@hypit/runtime";

import { AwsS3ObjectClient } from "./client.js";
import type { S3ObjectClient } from "./client.js";

export const s3ResourceStoreModuleRef = {
  name: "@hypit/resource-store-s3",
  version: "1",
} as const;

export function normalizeS3ResourcePrefix(prefix: string | undefined): string {
  if (prefix === undefined || prefix.length === 0) return "";
  const normalized = prefix.replace(/^\/+|\/+$/gu, "");
  assert(normalized.length > 0, "S3 Resource prefix must contain a non-slash character");
  assert(!normalized.split("/").some((part) => part === "." || part === ".."),
    "S3 Resource prefix cannot contain dot path segments");
  return normalized;
}

export function s3ResourceKey(prefix: string | undefined, resource: ResourceId): string {
  if (!isResourceId(resource)) throw new Error("Resource id is invalid");
  const normalized = normalizeS3ResourcePrefix(prefix);
  const relative = `resources/${resource}`;
  return normalized.length === 0 ? relative : `${normalized}/${relative}`;
}

type S3Location = {
  readonly bucket: string;
  readonly prefix?: string;
  readonly expectedBucketOwner?: string;
};

export type S3ResourceStoreOptions = S3Location & {
  readonly client: S3ObjectClient;
  readonly partSizeBytes?: number;
};

export type CreateS3ResourceStorePackageOptions = S3Location & {
  readonly instance?: string;
  readonly partSizeBytes?: number;
  readonly region?: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  readonly client?: S3ObjectClient;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

/** Optional S3 byte store for Runtime implementations that deliberately embed it. */
export class S3ResourceStore implements ResourceStore {
  readonly #client: S3ObjectClient;
  readonly #bucket: string;
  readonly #prefix: string;
  readonly #expectedBucketOwner: string | undefined;
  readonly #partSizeBytes: number;
  readonly open?: (resource: ResourceId) => Promise<AsyncIterable<Uint8Array> | undefined>;
  readonly putStream?: (chunks: AsyncIterable<Uint8Array>, mediaType: string) => Promise<BlobRef>;
  readonly writeStream?: (resource: BlobRef, chunks: AsyncIterable<Uint8Array>) => Promise<void>;

  constructor(options: S3ResourceStoreOptions) {
    assert(options.bucket.trim().length > 0, "S3 Resource bucket must not be empty");
    if (options.expectedBucketOwner !== undefined) {
      assert(options.expectedBucketOwner.trim().length > 0, "expected S3 bucket owner must not be empty");
    }
    this.#client = options.client;
    this.#bucket = options.bucket;
    this.#prefix = normalizeS3ResourcePrefix(options.prefix);
    this.#expectedBucketOwner = options.expectedBucketOwner;
    this.#partSizeBytes = positiveInteger(options.partSizeBytes ?? 16 * 1024 * 1024, "partSizeBytes");
    assert(this.#partSizeBytes >= 5 * 1024 * 1024, "S3 requires multipart parts of at least 5 MiB");
    const client = options.client;
    if (client.open !== undefined && client.createMultipart !== undefined && client.uploadPart !== undefined
      && client.completeMultipart !== undefined) {
      this.open = (resource) => this.#openStream(resource);
      this.putStream = (chunks, mediaType) => this.#putStream(chunks, mediaType);
      this.writeStream = async (resource, chunks) => {
        await this.#storeStream(resource.resource, chunks, resource.mediaType, resource.size);
      };
    }
  }

  key(resource: ResourceId): string {
    return s3ResourceKey(this.#prefix, resource);
  }

  #owner(): { readonly ExpectedBucketOwner?: string } {
    return this.#expectedBucketOwner === undefined ? {} : { ExpectedBucketOwner: this.#expectedBucketOwner };
  }

  async put(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
    assert(mediaType.trim().length > 0, "Resource mediaType must not be empty");
    const copy = Uint8Array.from(bytes);
    const resource = `res_${randomUUID()}` as ResourceId;
    await this.#client.put({
      Bucket: this.#bucket,
      Key: this.key(resource),
      Body: copy,
      ContentLength: copy.byteLength,
      ContentType: mediaType,
      ...this.#owner(),
    });
    return { kind: "blob", resource, size: copy.byteLength, mediaType };
  }

  async write(resource: BlobRef, bytes: Uint8Array): Promise<void> {
    const copy = Uint8Array.from(bytes);
    assert(copy.byteLength === resource.size,
      `Resource ${resource.resource} has size ${copy.byteLength}, expected ${resource.size}`);
    await this.#client.put({
      Bucket: this.#bucket,
      Key: this.key(resource.resource),
      Body: copy,
      ContentLength: copy.byteLength,
      ContentType: resource.mediaType,
      ...this.#owner(),
    });
  }

  async get(resource: ResourceId): Promise<Uint8Array | undefined> {
    const bytes = await this.#client.get({
      Bucket: this.#bucket,
      Key: this.key(resource),
      ...this.#owner(),
    });
    return bytes === undefined ? undefined : Uint8Array.from(bytes);
  }

  async has(resource: ResourceId): Promise<boolean> {
    if (this.#client.head === undefined) {
      return await this.#client.get({ Bucket: this.#bucket, Key: this.key(resource), ...this.#owner() }) !== undefined;
    }
    return await this.#client.head({ Bucket: this.#bucket, Key: this.key(resource), ...this.#owner() }) !== undefined;
  }

  async #openStream(resource: ResourceId): Promise<AsyncIterable<Uint8Array> | undefined> {
    return await this.#client.open!({
      Bucket: this.#bucket,
      Key: this.key(resource),
      ...this.#owner(),
    });
  }

  async #putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<BlobRef> {
    assert(mediaType.trim().length > 0, "Resource mediaType must not be empty");
    const resource = `res_${randomUUID()}` as ResourceId;
    const size = await this.#storeStream(resource, chunks, mediaType);
    return { kind: "blob", resource, size, mediaType };
  }

  async #storeStream(
    resource: ResourceId,
    chunks: AsyncIterable<Uint8Array>,
    mediaType: string,
    expectedSize?: number,
  ): Promise<number> {
    const client = this.#client as Required<Pick<S3ObjectClient,
      "createMultipart" | "uploadPart" | "completeMultipart">> & S3ObjectClient;
    const key = this.key(resource);
    const owner = this.#owner();
    const uploadId = await client.createMultipart({
      Bucket: this.#bucket, Key: key, ContentType: mediaType, ...owner,
    });
    const parts: { PartNumber: number; ETag: string }[] = [];
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    let size = 0;
    const flush = async (): Promise<void> => {
      if (pendingBytes === 0 && parts.length > 0) return;
      const body = new Uint8Array(pendingBytes);
      let offset = 0;
      for (const piece of pending) {
        body.set(piece, offset);
        offset += piece.byteLength;
      }
      pending = [];
      pendingBytes = 0;
      const partNumber = parts.length + 1;
      const { etag } = await client.uploadPart({
        Bucket: this.#bucket, Key: key, UploadId: uploadId,
        PartNumber: partNumber, Body: body, ContentLength: body.byteLength, ...owner,
      });
      parts.push({ PartNumber: partNumber, ETag: etag });
    };
    try {
      for await (const value of chunks) {
        if (!(value instanceof Uint8Array)) throw new Error("Resource stream yielded non-bytes");
        const chunk = Uint8Array.from(value);
        size += chunk.byteLength;
        if (!Number.isSafeInteger(size)) throw new Error("Resource stream exceeds the supported size");
        let offset = 0;
        while (offset < chunk.byteLength) {
          const take = Math.min(this.#partSizeBytes - pendingBytes, chunk.byteLength - offset);
          pending.push(chunk.slice(offset, offset + take));
          pendingBytes += take;
          offset += take;
          if (pendingBytes === this.#partSizeBytes) await flush();
        }
      }
      if (pendingBytes > 0 || parts.length === 0) await flush();
      if (expectedSize !== undefined && size !== expectedSize) {
        throw new Error(`Resource ${resource} has size ${size}, expected ${expectedSize}`);
      }
      await client.completeMultipart({
        Bucket: this.#bucket, Key: key, UploadId: uploadId,
        MultipartUpload: { Parts: parts }, ...owner,
      });
      return size;
    } catch (error) {
      await client.abortMultipart?.({
        Bucket: this.#bucket, Key: key, UploadId: uploadId, ...owner,
      }).catch(() => undefined);
      throw error;
    }
  }
}

export function createS3ResourceStore(
  options: CreateS3ResourceStorePackageOptions,
): S3ResourceStore {
  const prefix = normalizeS3ResourcePrefix(options.prefix);
  const client = options.client ?? new AwsS3ObjectClient({
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
  });
  return new S3ResourceStore({
    client,
    bucket: options.bucket,
    ...(options.partSizeBytes === undefined ? {} : { partSizeBytes: options.partSizeBytes }),
    ...(prefix.length === 0 ? {} : { prefix }),
    ...(options.expectedBucketOwner === undefined ? {} : { expectedBucketOwner: options.expectedBucketOwner }),
  });
}
