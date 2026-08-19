import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SFNClient, StopExecutionCommand } from "@aws-sdk/client-sfn";
import {
  deploySite,
  getRenderProgress,
  renderToLambda,
} from "@hyperframes/aws-lambda/sdk";
import type {
  RenderHandle,
  RenderProgress,
  SerializableDistributedRenderConfig,
  SiteHandle,
} from "@hyperframes/aws-lambda/sdk";

export type HyperframesLambdaSite = SiteHandle;
export type HyperframesLambdaRender = RenderHandle;
export type HyperframesLambdaProgress = RenderProgress;
export type HyperframesLambdaRenderConfig = SerializableDistributedRenderConfig;

export type HyperframesLambdaOutput = {
  readonly chunks: AsyncIterable<Uint8Array>;
  readonly contentLength?: number;
};

export interface HyperframesAwsLambdaClient {
  deploySite(input: {
    readonly projectDir: string;
    readonly bucketName: string;
    readonly region: string;
  }): Promise<HyperframesLambdaSite>;
  render(input: {
    readonly siteHandle: HyperframesLambdaSite;
    readonly config: HyperframesLambdaRenderConfig;
    readonly bucketName: string;
    readonly stateMachineArn: string;
    readonly region: string;
    readonly outputKey: string;
    readonly executionName: string;
  }): Promise<HyperframesLambdaRender>;
  progress(input: {
    readonly executionArn: string;
    readonly defaultMemorySizeMb: number;
    readonly region: string;
  }): Promise<HyperframesLambdaProgress>;
  stop(input: {
    readonly executionArn: string;
    readonly region: string;
    readonly reason: string;
  }): Promise<void>;
  openOutput(input: {
    readonly s3Uri: string;
    readonly region: string;
  }): Promise<HyperframesLambdaOutput>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function parseS3Uri(uri: string): { readonly bucket: string; readonly key: string } {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`HyperFrames output URI is invalid: ${uri}`);
  }
  assert(parsed.protocol === "s3:" && parsed.hostname.length > 0 && parsed.pathname.length > 1,
    `HyperFrames output URI must be s3://bucket/key; got ${uri}`);
  assert(parsed.search.length === 0 && parsed.hash.length === 0,
    "HyperFrames output URI must not contain a query or fragment");
  return { bucket: parsed.hostname, key: decodeURIComponent(parsed.pathname.slice(1)) };
}

async function* byteChunks(body: unknown): AsyncIterable<Uint8Array> {
  assert(body !== null && typeof body === "object" && Symbol.asyncIterator in body,
    "HyperFrames S3 output has no streaming body");
  for await (const chunk of body as AsyncIterable<unknown>) {
    if (typeof chunk === "string") yield Buffer.from(chunk);
    else if (chunk instanceof Uint8Array) yield chunk;
    else throw new Error("HyperFrames S3 output emitted a non-byte chunk");
  }
}

/** Uses only the AWS SDK default credential chain. No credential bytes enter this package. */
export function createHyperframesAwsLambdaClient(region: string): HyperframesAwsLambdaClient {
  const s3 = new S3Client({ region });
  const sfn = new SFNClient({ region });
  return {
    deploySite: async (input) => await deploySite({ ...input, s3 }),
    render: async (input) => await renderToLambda({
      ...input,
      planProtocol: "v2",
      s3,
      sfn,
    }),
    progress: async (input) => await getRenderProgress({ ...input, sfn }),
    async stop(input) {
      await sfn.send(new StopExecutionCommand({
        executionArn: input.executionArn,
        error: "HypitBuildCancelled",
        cause: input.reason,
      }));
    },
    async openOutput(input) {
      const target = parseS3Uri(input.s3Uri);
      const output = await s3.send(new GetObjectCommand({ Bucket: target.bucket, Key: target.key }));
      if (output.Body === undefined) throw new Error(`HyperFrames output ${input.s3Uri} has no body`);
      return {
        chunks: byteChunks(output.Body),
        ...(output.ContentLength === undefined ? {} : { contentLength: output.ContentLength }),
      };
    },
  };
}
