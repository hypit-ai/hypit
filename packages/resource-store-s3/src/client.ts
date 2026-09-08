import { addAbortSignal, Readable } from "node:stream";
import type { ResourceIOOptions } from "@hypit/runtime";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import type {
  AbortMultipartUploadCommandInput,
  CompleteMultipartUploadCommandInput,
  CreateMultipartUploadCommandInput,
  GetObjectCommandInput,
  PutObjectCommandInput,
  S3ClientConfig,
  UploadPartCommandInput,
} from "@aws-sdk/client-s3";

/**
 * `put` and `get` are the whole port. The rest are optional: a client that
 * omits them leaves the store implementing only the ResourceStore,
 * which is exactly what the optional Streaming facet means.
 */
export type S3ObjectClient = {
  put(input: PutObjectCommandInput, options?: ResourceIOOptions): Promise<void>;
  get(input: GetObjectCommandInput, options?: ResourceIOOptions): Promise<Uint8Array | undefined>;
  /**
   * The object's bytes as they arrive. Separate from `get` because an Artifact
   * may be a whole programme: a caller that asked to stream must not have the
   * object assembled in memory on its behalf.
   */
  open?(input: GetObjectCommandInput, options?: ResourceIOOptions): Promise<AsyncIterable<Uint8Array> | undefined>;
  /** Undefined when the key is absent. */
  head?(input: GetObjectCommandInput, options?: ResourceIOOptions): Promise<{ readonly size: number } | undefined>;
  createMultipart?(input: CreateMultipartUploadCommandInput, options?: ResourceIOOptions): Promise<string>;
  uploadPart?(input: UploadPartCommandInput, options?: ResourceIOOptions): Promise<{ readonly etag: string }>;
  completeMultipart?(input: CompleteMultipartUploadCommandInput, options?: ResourceIOOptions): Promise<void>;
  abortMultipart?(input: AbortMultipartUploadCommandInput, options?: ResourceIOOptions): Promise<void>;
};

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return undefined;
  const metadata = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) return undefined;
  return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

function absent(error: unknown): boolean {
  return statusCode(error) === 404
    || (error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound"));
}

export class AwsS3ObjectClient implements S3ObjectClient {
  readonly #client: S3Client;

  constructor(config: S3ClientConfig = {}) {
    // Credentials come from the SDK default chain and are never rebuilt here
    // from AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY. A managed runtime also
    // injects AWS_SESSION_TOKEN, and a hand-assembled two-field credential
    // object silently drops it — every request then fails InvalidAccessKeyId.
    this.#client = new S3Client(config);
  }

  async put(input: PutObjectCommandInput, options: ResourceIOOptions = {}): Promise<void> {
    await this.#client.send(new PutObjectCommand(input), (options.signal === undefined ? {} : { abortSignal: options.signal }));
  }

  async get(input: GetObjectCommandInput, options: ResourceIOOptions = {}): Promise<Uint8Array | undefined> {
    const source = await this.open(input, options);
    if (source === undefined) return undefined;
    const chunks: Uint8Array[] = [];
    for await (const chunk of source) chunks.push(chunk);
    return Uint8Array.from(Buffer.concat(chunks));
  }

  async open(input: GetObjectCommandInput, options: ResourceIOOptions = {}): Promise<AsyncIterable<Uint8Array> | undefined> {
    options.signal?.throwIfAborted();
    let body: Readable;
    try {
      const response = await this.#client.send(new GetObjectCommand(input), (options.signal === undefined ? {} : { abortSignal: options.signal }));
      if (response.Body === undefined) throw new Error(`S3 object ${input.Key ?? "<unknown>"} has no body`);
      body = response.Body as Readable;
      // open() can be cancelled before its caller starts consuming the body.
      body.on("error", () => {});
      if (options.signal !== undefined) addAbortSignal(options.signal, body);
    } catch (error) {
      if (absent(error)) return undefined;
      throw error;
    }
    return (async function* () {
      try {
        for await (const chunk of body) {
          options.signal?.throwIfAborted();
          yield Uint8Array.from(chunk as Buffer);
        }
      } finally { body.destroy(); }
    })();
  }

  async head(input: GetObjectCommandInput, options: ResourceIOOptions = {}): Promise<{ readonly size: number } | undefined> {
    try {
      const response = await this.#client.send(new HeadObjectCommand({
        Bucket: input.Bucket,
        Key: input.Key,
        ...(input.ExpectedBucketOwner === undefined ? {} : { ExpectedBucketOwner: input.ExpectedBucketOwner }),
      }), (options.signal === undefined ? {} : { abortSignal: options.signal }));
      return { size: response.ContentLength ?? 0 };
    } catch (error) {
      if (absent(error)) return undefined;
      throw error;
    }
  }

  async createMultipart(input: CreateMultipartUploadCommandInput, options: ResourceIOOptions = {}): Promise<string> {
    const response = await this.#client.send(new CreateMultipartUploadCommand(input), (options.signal === undefined ? {} : { abortSignal: options.signal }));
    if (response.UploadId === undefined) throw new Error("S3 did not return a multipart upload id");
    return response.UploadId;
  }

  async uploadPart(input: UploadPartCommandInput, options: ResourceIOOptions = {}): Promise<{ readonly etag: string }> {
    const response = await this.#client.send(new UploadPartCommand(input), (options.signal === undefined ? {} : { abortSignal: options.signal }));
    if (response.ETag === undefined) throw new Error("S3 did not return a part ETag");
    return { etag: response.ETag };
  }

  async completeMultipart(input: CompleteMultipartUploadCommandInput, options: ResourceIOOptions = {}): Promise<void> {
    await this.#client.send(new CompleteMultipartUploadCommand(input), (options.signal === undefined ? {} : { abortSignal: options.signal }));
  }

  async abortMultipart(input: AbortMultipartUploadCommandInput, options: ResourceIOOptions = {}): Promise<void> {
    await this.#client.send(new AbortMultipartUploadCommand(input), (options.signal === undefined ? {} : { abortSignal: options.signal }));
  }

}
