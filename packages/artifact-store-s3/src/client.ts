import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import type {
  AbortMultipartUploadCommandInput,
  CompleteMultipartUploadCommandInput,
  CopyObjectCommandInput,
  CreateMultipartUploadCommandInput,
  DeleteObjectCommandInput,
  GetObjectCommandInput,
  PutObjectCommandInput,
  S3ClientConfig,
  UploadPartCommandInput,
} from "@aws-sdk/client-s3";

/**
 * `put` and `get` are the whole port. The rest are optional: a client that
 * omits them leaves the store implementing only the three-method ArtifactStore,
 * which is exactly what the optional Streaming facet means.
 */
export type S3ObjectClient = {
  put(input: PutObjectCommandInput): Promise<void>;
  get(input: GetObjectCommandInput): Promise<Uint8Array | undefined>;
  /**
   * The object's bytes as they arrive. Separate from `get` because an Artifact
   * may be a whole programme: a caller that asked to stream must not have the
   * object assembled in memory on its behalf.
   */
  open?(input: GetObjectCommandInput): Promise<AsyncIterable<Uint8Array> | undefined>;
  /** Undefined when the key is absent. */
  head?(input: GetObjectCommandInput): Promise<{ readonly size: number } | undefined>;
  createMultipart?(input: CreateMultipartUploadCommandInput): Promise<string>;
  uploadPart?(input: UploadPartCommandInput): Promise<{ readonly etag: string }>;
  completeMultipart?(input: CompleteMultipartUploadCommandInput): Promise<void>;
  abortMultipart?(input: AbortMultipartUploadCommandInput): Promise<void>;
  copy?(input: CopyObjectCommandInput): Promise<void>;
  delete?(input: DeleteObjectCommandInput): Promise<void>;
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

  async put(input: PutObjectCommandInput): Promise<void> {
    await this.#client.send(new PutObjectCommand(input));
  }

  async get(input: GetObjectCommandInput): Promise<Uint8Array | undefined> {
    try {
      const response = await this.#client.send(new GetObjectCommand(input));
      if (response.Body === undefined) throw new Error(`S3 object ${input.Key ?? "<unknown>"} has no body`);
      return Uint8Array.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (absent(error)) return undefined;
      throw error;
    }
  }

  async open(input: GetObjectCommandInput): Promise<AsyncIterable<Uint8Array> | undefined> {
    let body: AsyncIterable<Uint8Array>;
    try {
      const response = await this.#client.send(new GetObjectCommand(input));
      if (response.Body === undefined) throw new Error(`S3 object ${input.Key ?? "<unknown>"} has no body`);
      body = response.Body as unknown as AsyncIterable<Uint8Array>;
    } catch (error) {
      if (absent(error)) return undefined;
      throw error;
    }
    return (async function* () {
      for await (const chunk of body) yield Uint8Array.from(chunk);
    })();
  }

  async head(input: GetObjectCommandInput): Promise<{ readonly size: number } | undefined> {
    try {
      const response = await this.#client.send(new HeadObjectCommand({
        Bucket: input.Bucket,
        Key: input.Key,
        ...(input.ExpectedBucketOwner === undefined ? {} : { ExpectedBucketOwner: input.ExpectedBucketOwner }),
      }));
      return { size: response.ContentLength ?? 0 };
    } catch (error) {
      if (absent(error)) return undefined;
      throw error;
    }
  }

  async createMultipart(input: CreateMultipartUploadCommandInput): Promise<string> {
    const response = await this.#client.send(new CreateMultipartUploadCommand(input));
    if (response.UploadId === undefined) throw new Error("S3 did not return a multipart upload id");
    return response.UploadId;
  }

  async uploadPart(input: UploadPartCommandInput): Promise<{ readonly etag: string }> {
    const response = await this.#client.send(new UploadPartCommand(input));
    if (response.ETag === undefined) throw new Error("S3 did not return a part ETag");
    return { etag: response.ETag };
  }

  async completeMultipart(input: CompleteMultipartUploadCommandInput): Promise<void> {
    await this.#client.send(new CompleteMultipartUploadCommand(input));
  }

  async abortMultipart(input: AbortMultipartUploadCommandInput): Promise<void> {
    await this.#client.send(new AbortMultipartUploadCommand(input));
  }

  async copy(input: CopyObjectCommandInput): Promise<void> {
    await this.#client.send(new CopyObjectCommand(input));
  }

  async delete(input: DeleteObjectCommandInput): Promise<void> {
    await this.#client.send(new DeleteObjectCommand(input));
  }

}
