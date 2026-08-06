import { createHash } from "node:crypto";

import { digestOf, isDigest } from "@svml/protocol";
import type { BlobRef, Digest } from "@svml/protocol";
import type {
  ArtifactStore,
  RuntimeModuleManifest,
  RuntimeProfileInstance,
} from "@svml/runtime";

import { AwsS3ObjectClient } from "./client.js";
import type { S3ObjectClient } from "./client.js";
import {
  s3ArtifactStoreFacet,
  s3ArtifactStoreRuntimeManifest,
} from "./manifest.js";

type S3Location = {
  readonly bucket: string;
  readonly prefix?: string;
  readonly expectedBucketOwner?: string;
};

export type S3ArtifactStoreOptions = S3Location & {
  readonly client: S3ObjectClient;
  readonly maxConflictRetries?: number;
};

export type CreateS3ArtifactStorePackageOptions = S3Location & {
  readonly instance?: string;
  readonly region?: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  /** Injection point for tests, MinIO and specially configured trusted AWS clients. */
  readonly client?: S3ObjectClient;
};

export type S3ArtifactStorePackage = {
  readonly name: string;
  readonly manifest: RuntimeModuleManifest;
  readonly instance: RuntimeProfileInstance;
  readonly store: ArtifactStore;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizePrefix(prefix: string | undefined): string {
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

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return undefined;
  const metadata = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) return undefined;
  return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

/** Whole-object S3 implementation of the content-addressed ArtifactStore port. */
export class S3ArtifactStore implements ArtifactStore {
  readonly #client: S3ObjectClient;
  readonly #bucket: string;
  readonly #prefix: string;
  readonly #expectedBucketOwner: string | undefined;
  readonly #maxConflictRetries: number;

  constructor(options: S3ArtifactStoreOptions) {
    assert(options.bucket.trim().length > 0, "S3 Artifact bucket must not be empty");
    if (options.expectedBucketOwner !== undefined) {
      assert(options.expectedBucketOwner.trim().length > 0, "expected S3 bucket owner must not be empty");
    }
    this.#client = options.client;
    this.#bucket = options.bucket;
    this.#prefix = normalizePrefix(options.prefix);
    this.#expectedBucketOwner = options.expectedBucketOwner;
    this.#maxConflictRetries = positiveInteger(options.maxConflictRetries ?? 3, "maxConflictRetries");
  }

  key(digest: Digest): string {
    if (!isDigest(digest)) throw new Error("Artifact digest is invalid");
    const [algorithm, hex] = digest.split(":");
    if (algorithm !== "sha256" || hex === undefined) throw new Error(`unsupported Artifact digest ${digest}`);
    const relative = `${algorithm}/${hex.slice(0, 2)}/${hex}`;
    return this.#prefix.length === 0 ? relative : `${this.#prefix}/${relative}`;
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
      IfNoneMatch: "*",
      Metadata: {
        "svml-digest": digest,
        "svml-size": String(copy.byteLength),
      },
      ...(this.#expectedBucketOwner === undefined
        ? {}
        : { ExpectedBucketOwner: this.#expectedBucketOwner }),
    } as const;
    for (let attempt = 1; attempt <= this.#maxConflictRetries; attempt += 1) {
      try {
        await this.#client.put(input);
        return { kind: "blob", digest, size: copy.byteLength, mediaType };
      } catch (error) {
        const status = statusCode(error);
        if (status === 409 && attempt < this.#maxConflictRetries) continue;
        if (status !== 412) throw error;
        const existing = await this.get(digest);
        if (existing === undefined) throw new Error(`S3 reported existing Artifact ${digest}, but it cannot be read`);
        return { kind: "blob", digest, size: copy.byteLength, mediaType };
      }
    }
    throw new Error(`S3 Artifact ${digest} exceeded conditional-write retries`);
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
    const copy = Uint8Array.from(bytes);
    const actual = `sha256:${createHash("sha256").update(copy).digest("hex")}`;
    if (actual !== digest) throw new Error(`Artifact ${digest} content digest differs`);
    return copy;
  }

  async has(digest: Digest): Promise<boolean> {
    // Existence by key is insufficient: ArtifactStore promises content identity, so verify bytes.
    return (await this.get(digest)) !== undefined;
  }
}

export function createS3ArtifactStorePackage(
  options: CreateS3ArtifactStorePackageOptions,
): S3ArtifactStorePackage {
  const instance = options.instance ?? "artifacts.s3";
  assert(instance.trim().length > 0, "S3 ArtifactStore instance id must not be empty");
  const prefix = normalizePrefix(options.prefix);
  const configuration = {
    bucket: options.bucket,
    prefix,
    ...(options.expectedBucketOwner === undefined ? {} : { expectedBucketOwner: options.expectedBucketOwner }),
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
  };
  const client = options.client ?? new AwsS3ObjectClient({
    ...(options.region === undefined ? {} : { region: options.region }),
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
  });
  return {
    name: instance,
    manifest: s3ArtifactStoreRuntimeManifest,
    instance: {
      id: instance,
      facet: s3ArtifactStoreFacet,
      configurationDigest: digestOf(configuration),
    },
    store: new S3ArtifactStore({
      client,
      bucket: options.bucket,
      ...(prefix.length === 0 ? {} : { prefix }),
      ...(options.expectedBucketOwner === undefined
        ? {}
        : { expectedBucketOwner: options.expectedBucketOwner }),
    }),
  };
}
