import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type {
  GetObjectCommandInput,
  PutObjectCommandInput,
  S3ClientConfig,
} from "@aws-sdk/client-s3";

export type S3ObjectClient = {
  put(input: PutObjectCommandInput): Promise<void>;
  get(input: GetObjectCommandInput): Promise<Uint8Array | undefined>;
};

function statusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return undefined;
  const metadata = error.$metadata;
  if (typeof metadata !== "object" || metadata === null || !("httpStatusCode" in metadata)) return undefined;
  return typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
}

export class AwsS3ObjectClient implements S3ObjectClient {
  readonly #client: S3Client;

  constructor(config: S3ClientConfig = {}) {
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
      if (statusCode(error) === 404 || (error instanceof Error && error.name === "NoSuchKey")) return undefined;
      throw error;
    }
  }
}
