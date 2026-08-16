import { createHash, randomUUID } from "node:crypto";

import { isDigest } from "@narratage/protocol";
import type { BlobRef, Digest } from "@narratage/protocol";
import type { ArtifactStore } from "@narratage/runtime";

import { AwsS3ObjectClient } from "./client.js";
import type { S3ListPage, S3ObjectClient } from "./client.js";

export const s3ArtifactStoreModuleRef = {
  name: "@narratage/artifact-store-s3",
  version: "1",
} as const;

/**
 * Where an Artifact lives in a bucket, given its digest.
 *
 * Exported because a remote worker that reads and writes the same bucket must
 * address objects identically. Two statements of this rule would be two
 * different stores wearing one bucket name.
 */
export function s3ArtifactKey(prefix: string | undefined, digest: Digest): string {
  if (!isDigest(digest)) throw new Error("Artifact digest is invalid");
  const [algorithm, hex] = digest.split(":");
  if (algorithm !== "sha256" || hex === undefined) throw new Error(`unsupported Artifact digest ${digest}`);
  const normalized = normalizeS3ArtifactPrefix(prefix);
  const relative = `${algorithm}/${hex.slice(0, 2)}/${hex}`;
  return normalized.length === 0 ? relative : `${normalized}/${relative}`;
}

type S3Location = {
  readonly bucket: string;
  readonly prefix?: string;
  readonly expectedBucketOwner?: string;
};

export type S3ArtifactStoreOptions = S3Location & {
  readonly client: S3ObjectClient;
  /** Bytes buffered before a part is sent. S3 requires at least 5 MiB per non-final part. */
  readonly partSizeBytes?: number;
};

export type CreateS3ArtifactStorePackageOptions = S3Location & {
  readonly instance?: string;
  readonly partSizeBytes?: number;
  readonly region?: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  /** Injection point for tests, MinIO and specially configured trusted AWS clients. */
  readonly client?: S3ObjectClient;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function normalizeS3ArtifactPrefix(prefix: string | undefined): string {
  if (prefix === undefined || prefix.length === 0) return "";
  const normalized = prefix.replace(/^\/+|\/+$/gu, "");
  assert(normalized.length > 0, "S3 Artifact prefix must contain a non-slash character");
  assert(!normalized.split("/").some((part) => part === "." || part === ".."),
    "S3 Artifact prefix cannot contain dot path segments");
  return normalized;
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive safe integer`);
  return value;
}

/**
 * Content-addressed S3 ArtifactStore.
 *
 * The streaming and retention facets are detected by method presence, so this
 * store attaches them only when the injected client can back them. Claiming a
 * facet and then throwing would be worse than not claiming it: a deployment
 * would discover the gap during a Build rather than when it chose the client.
 */
export class S3ArtifactStore implements ArtifactStore {
  readonly #client: S3ObjectClient;
  readonly #bucket: string;
  readonly #prefix: string;
  readonly #expectedBucketOwner: string | undefined;
  readonly #partSizeBytes: number;
  /** Present only when the client can stream and upload in parts. */
  readonly open?: (digest: Digest) => Promise<AsyncIterable<Uint8Array> | undefined>;
  readonly putStream?: (chunks: AsyncIterable<Uint8Array>, mediaType: string) => Promise<BlobRef>;
  /** Present only when the client can enumerate and remove objects. */
  readonly list?: () => Promise<readonly Digest[]>;
  readonly delete?: (digest: Digest) => Promise<boolean>;

  constructor(options: S3ArtifactStoreOptions) {
    assert(options.bucket.trim().length > 0, "S3 Artifact bucket must not be empty");
    if (options.expectedBucketOwner !== undefined) {
      assert(options.expectedBucketOwner.trim().length > 0, "expected S3 bucket owner must not be empty");
    }
    this.#client = options.client;
    this.#bucket = options.bucket;
    this.#prefix = normalizeS3ArtifactPrefix(options.prefix);
    this.#expectedBucketOwner = options.expectedBucketOwner;
    this.#partSizeBytes = positiveInteger(options.partSizeBytes ?? 16 * 1024 * 1024, "partSizeBytes");
    assert(this.#partSizeBytes >= 5 * 1024 * 1024, "S3 requires multipart parts of at least 5 MiB");
    const client = options.client;
    if (client.open !== undefined && client.createMultipart !== undefined && client.uploadPart !== undefined
      && client.completeMultipart !== undefined && client.copy !== undefined) {
      this.open = (digest) => this.#openStream(digest);
      this.putStream = (chunks, mediaType) => this.#putStream(chunks, mediaType);
    }
    if (client.list !== undefined && client.delete !== undefined && client.head !== undefined) {
      this.list = () => this.#list();
      this.delete = (digest) => this.#delete(digest);
    }
  }

  key(digest: Digest): string {
    return s3ArtifactKey(this.#prefix, digest);
  }

  async put(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
    assert(mediaType.trim().length > 0, "Artifact mediaType must not be empty");
    const copy = Uint8Array.from(bytes);
    const hash = createHash("sha256").update(copy);
    const hex = hash.copy().digest("hex");
    const digest = `sha256:${hex}` as Digest;
    const input = {
      Bucket: this.#bucket,
      Key: this.key(digest),
      Body: copy,
      ContentLength: copy.byteLength,
      ContentType: mediaType,
      ChecksumSHA256: hash.digest("base64"),
      ...(this.#expectedBucketOwner === undefined
        ? {}
        : { ExpectedBucketOwner: this.#expectedBucketOwner }),
    } as const;
    await this.#client.put(input);
    return { kind: "blob", digest, size: copy.byteLength, mediaType };
  }

  async get(digest: Digest): Promise<Uint8Array | undefined> {
    const bytes = await this.#client.get({
      Bucket: this.#bucket,
      Key: this.key(digest),
      ...(this.#expectedBucketOwner === undefined
        ? {}
        : { ExpectedBucketOwner: this.#expectedBucketOwner }),
    });
    if (bytes === undefined) return undefined;
    return Uint8Array.from(bytes);
  }

  async has(digest: Digest): Promise<boolean> {
    if (this.#client.head === undefined) return (await this.#client.get({
      Bucket: this.#bucket,
      Key: this.key(digest),
      ...(this.#expectedBucketOwner === undefined
        ? {}
        : { ExpectedBucketOwner: this.#expectedBucketOwner }),
    })) !== undefined;
    return (await this.#client.head({
      Bucket: this.#bucket,
      Key: this.key(digest),
      ...(this.#expectedBucketOwner === undefined
        ? {}
        : { ExpectedBucketOwner: this.#expectedBucketOwner }),
    })) !== undefined;
  }

  async #openStream(digest: Digest): Promise<AsyncIterable<Uint8Array> | undefined> {
    const chunks = await this.#client.open!({
      Bucket: this.#bucket,
      Key: this.key(digest),
      ...(this.#expectedBucketOwner === undefined
        ? {}
        : { ExpectedBucketOwner: this.#expectedBucketOwner }),
    });
    if (chunks === undefined) return undefined;
    return chunks;
  }

  /**
   * Multipart upload to a staging key, then a server-side copy onto the
   * content-addressed key.
   *
   * The detour exists because S3 needs the destination key before the first
   * part, and a content-addressed key is not known until the last byte has been
   * hashed. The copy is server-side, so the bytes cross the wire once.
   */
  async #putStream(chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<BlobRef> {
    assert(mediaType.trim().length > 0, "Artifact mediaType must not be empty");
    const client = this.#client as Required<S3ObjectClient>;
    const owner = this.#expectedBucketOwner === undefined
      ? {}
      : { ExpectedBucketOwner: this.#expectedBucketOwner };
    const staging = `${this.#prefix.length === 0 ? "" : `${this.#prefix}/`}.incoming/${randomUUID()}`;
    const uploadId = await client.createMultipart({
      Bucket: this.#bucket, Key: staging, ContentType: mediaType, ...owner,
    });
    const hash = createHash("sha256");
    const parts: { PartNumber: number; ETag: string }[] = [];
    let size = 0;
    try {
      let pending: Uint8Array[] = [];
      let pendingBytes = 0;
      const flush = async (): Promise<void> => {
        if (pendingBytes === 0) return;
        const body = new Uint8Array(pendingBytes);
        let offset = 0;
        for (const piece of pending) {
          body.set(piece, offset);
          offset += piece.byteLength;
        }
        pending = [];
        pendingBytes = 0;
        const partNumber = parts.length + 1;
        const { etag } = await client.uploadPart!({
          Bucket: this.#bucket, Key: staging, UploadId: uploadId,
          PartNumber: partNumber, Body: body, ContentLength: body.byteLength, ...owner,
        });
        parts.push({ PartNumber: partNumber, ETag: etag });
      };
      for await (const value of chunks) {
        if (!(value instanceof Uint8Array)) throw new Error("Artifact stream yielded non-bytes");
        const chunk = Uint8Array.from(value);
        hash.update(chunk);
        size += chunk.byteLength;
        if (!Number.isSafeInteger(size)) throw new Error("Artifact stream exceeds the supported size");
        pending.push(chunk);
        pendingBytes += chunk.byteLength;
        if (pendingBytes >= this.#partSizeBytes) await flush();
      }
      await flush();
      // Only now can the stream be known to have been empty. S3 rejects a
      // multipart upload with no parts, and an empty Artifact is a legitimate
      // one, so that case still sends a single empty part.
      if (parts.length === 0) {
        const { etag } = await client.uploadPart({
          Bucket: this.#bucket, Key: staging, UploadId: uploadId,
          PartNumber: 1, Body: new Uint8Array(0), ContentLength: 0, ...owner,
        });
        parts.push({ PartNumber: 1, ETag: etag });
      }
      await client.completeMultipart({
        Bucket: this.#bucket, Key: staging, UploadId: uploadId,
        MultipartUpload: { Parts: parts }, ...owner,
      });
    } catch (error) {
      await client.abortMultipart?.({
        Bucket: this.#bucket, Key: staging, UploadId: uploadId, ...owner,
      }).catch(() => undefined);
      throw error;
    }
    const digest = `sha256:${hash.digest("hex")}` as Digest;
    try {
      await client.copy({
        Bucket: this.#bucket,
        Key: this.key(digest),
        CopySource: `${this.#bucket}/${staging}`,
        ContentType: mediaType,
        MetadataDirective: "REPLACE",
        ...owner,
      });
    } finally {
      await client.delete?.({ Bucket: this.#bucket, Key: staging, ...owner }).catch(() => undefined);
    }
    return { kind: "blob", digest, size, mediaType };
  }

  /** Every Artifact this store holds. Staging keys are not Artifacts and are not listed. */
  async #list(): Promise<readonly Digest[]> {
    const root = this.#prefix.length === 0 ? "sha256/" : `${this.#prefix}/sha256/`;
    const digests: Digest[] = [];
    let continuationToken: string | undefined;
    do {
      const page: S3ListPage = await this.#client.list!({
        Bucket: this.#bucket,
        Prefix: root,
        ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
        ...(this.#expectedBucketOwner === undefined
          ? {}
          : { ExpectedBucketOwner: this.#expectedBucketOwner }),
      });
      for (const key of page.keys) {
        const hex = key.slice(root.length).split("/").at(-1);
        if (hex === undefined) continue;
        const digest = `sha256:${hex}`;
        // A key this store did not write is not reported as an Artifact.
        if (isDigest(digest) && this.key(digest as Digest) === key) digests.push(digest as Digest);
      }
      continuationToken = page.continuationToken;
    } while (continuationToken !== undefined);
    return digests;
  }

  /** True when the Artifact was there to remove. */
  async #delete(digest: Digest): Promise<boolean> {
    const key = this.key(digest);
    const owner = this.#expectedBucketOwner === undefined
      ? {}
      : { ExpectedBucketOwner: this.#expectedBucketOwner };
    const existing = await this.#client.head!({ Bucket: this.#bucket, Key: key, ...owner });
    if (existing === undefined) return false;
    await this.#client.delete!({ Bucket: this.#bucket, Key: key, ...owner });
    return true;
  }
}

export function createS3ArtifactStore(
  options: CreateS3ArtifactStorePackageOptions,
): S3ArtifactStore {
  const prefix = normalizeS3ArtifactPrefix(options.prefix);
  const client = options.client ?? new AwsS3ObjectClient({
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
  });
  return new S3ArtifactStore({
    client,
    bucket: options.bucket,
    ...(options.partSizeBytes === undefined ? {} : { partSizeBytes: options.partSizeBytes }),
    ...(prefix.length === 0 ? {} : { prefix }),
    ...(options.expectedBucketOwner === undefined
      ? {}
      : { expectedBucketOwner: options.expectedBucketOwner }),
  });
}
