import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";

export type BuildResultS3Client = {
  put(key: string, bytes: Uint8Array, mediaType: string): Promise<void>;
  putStream(key: string, chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  open(key: string): Promise<AsyncIterable<Uint8Array> | undefined>;
  list(prefix: string): Promise<readonly string[]>;
  delete(key: string): Promise<void>;
  close?(): void | Promise<void>;
};

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return undefined;
  const metadata = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) return undefined;
  return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

function absent(error: unknown): boolean {
  return statusCode(error) === 404 || (error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound"));
}

export type AwsBuildResultS3ClientOptions = {
  readonly bucket: string;
  readonly expectedBucketOwner?: string;
  readonly partSizeBytes?: number;
  readonly region?: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
};

export class AwsBuildResultS3Client implements BuildResultS3Client {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #expectedBucketOwner: string | undefined;
  readonly #partSizeBytes: number;

  constructor(options: AwsBuildResultS3ClientOptions) {
    this.#bucket = options.bucket;
    this.#expectedBucketOwner = options.expectedBucketOwner;
    this.#partSizeBytes = options.partSizeBytes ?? 16 * 1024 * 1024;
    this.#client = new S3Client({
      ...(options.region === undefined ? {} : { region: options.region }),
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
      ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
    } satisfies S3ClientConfig);
  }

  #owner(): { readonly ExpectedBucketOwner?: string } {
    return this.#expectedBucketOwner === undefined ? {} : { ExpectedBucketOwner: this.#expectedBucketOwner };
  }

  async put(key: string, bytes: Uint8Array, mediaType: string): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.byteLength,
        ContentType: mediaType,
        ...this.#owner(),
      }),
    );
  }

  async putStream(key: string, chunks: AsyncIterable<Uint8Array>, mediaType: string): Promise<void> {
    const created = await this.#client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.#bucket,
        Key: key,
        ContentType: mediaType,
        ...this.#owner(),
      }),
    );
    if (created.UploadId === undefined) throw new Error(`S3 did not start upload for ${key}`);
    const uploadId = created.UploadId;
    const parts: { PartNumber: number; ETag: string }[] = [];
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
      const uploaded = await this.#client.send(
        new UploadPartCommand({
          Bucket: this.#bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
          Body: body,
          ContentLength: body.byteLength,
          ...this.#owner(),
        }),
      );
      if (uploaded.ETag === undefined) throw new Error(`S3 did not return part ${partNumber} for ${key}`);
      parts.push({ PartNumber: partNumber, ETag: uploaded.ETag });
    };
    try {
      for await (const value of chunks) {
        const chunk = Uint8Array.from(value);
        let offset = 0;
        while (offset < chunk.byteLength) {
          const take = Math.min(this.#partSizeBytes - pendingBytes, chunk.byteLength - offset);
          pending.push(chunk.slice(offset, offset + take));
          pendingBytes += take;
          offset += take;
          if (pendingBytes === this.#partSizeBytes) await flush();
        }
      }
      await flush();
      if (parts.length === 0) {
        await this.#client.send(
          new AbortMultipartUploadCommand({
            Bucket: this.#bucket,
            Key: key,
            UploadId: uploadId,
            ...this.#owner(),
          }),
        );
        await this.put(key, new Uint8Array(), mediaType);
        return;
      }
      await this.#client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.#bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
          ...this.#owner(),
        }),
      );
    } catch (error) {
      await this.#client
        .send(
          new AbortMultipartUploadCommand({
            Bucket: this.#bucket,
            Key: key,
            UploadId: uploadId,
            ...this.#owner(),
          }),
        )
        .catch(() => undefined);
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          ...this.#owner(),
        }),
      );
      if (response.Body === undefined) throw new Error(`S3 object ${key} has no body`);
      return Uint8Array.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (absent(error)) return undefined;
      throw error;
    }
  }

  async open(key: string): Promise<AsyncIterable<Uint8Array> | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          ...this.#owner(),
        }),
      );
      if (response.Body === undefined) throw new Error(`S3 object ${key} has no body`);
      const body = response.Body as unknown as AsyncIterable<Uint8Array>;
      return (async function* () {
        for await (const chunk of body) yield Uint8Array.from(chunk);
      })();
    } catch (error) {
      if (absent(error)) return undefined;
      throw error;
    }
  }

  async list(prefix: string): Promise<readonly string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.#client.send(
        new ListObjectsV2Command({
          Bucket: this.#bucket,
          Prefix: prefix,
          ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
          ...this.#owner(),
        }),
      );
      keys.push(...(response.Contents ?? []).flatMap((item) => (item.Key === undefined ? [] : [item.Key])));
      continuationToken = response.IsTruncated === true ? response.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    return keys;
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ...this.#owner(),
      }),
    );
  }

  close(): void {
    this.#client.destroy();
  }
}
