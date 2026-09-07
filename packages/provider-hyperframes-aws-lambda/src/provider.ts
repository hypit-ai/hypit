import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  defineEndpointPackage,
  wakeAfter,
} from "@hypit/endpoint-kit";
import type {
  EndpointFulfillment,
  EndpointOutcome,
  EndpointPollContext,
  EndpointStartContext,
  AsyncEndpoint,
} from "@hypit/endpoint-kit";
import {
  assertHyperframesDocument,
} from "@hypit/hyperframes";
import type { HyperframesDocument } from "@hypit/hyperframes";
import { stageHyperframesProject } from "@hypit/hyperframes/project";
import {
  mediaTypes,
  sealRenderedVisual,
} from "@hypit/media";
import type { RenderedVisual } from "@hypit/media";
import {
  canonicalize,
} from "@hypit/protocol";
import type {
  BlobRef,
  CanonicalValue,
} from "@hypit/protocol";
import { renderHyperframesCapabilities } from "@hypit/render-hyperframes";
import { isStreamingResourceStore } from "@hypit/runtime";

import {
  createHyperframesAwsLambdaClient,
  parseS3Uri,
} from "./client.js";
import type {
  HyperframesAwsLambdaClient,
  HyperframesLambdaProgress,
  HyperframesLambdaRender,
  HyperframesLambdaRenderConfig,
  HyperframesLambdaSite,
} from "./client.js";

const HANDLE_CONTRACT = "hypit.hyperframes-aws-lambda-operation@1";
const SUPPORTED_FPS = new Set([24, 30, 60]);

export const awsLambdaHyperframesProviderModuleRef = {
  name: "@hypit/provider-hyperframes-aws-lambda",
  version: "1",
} as const;
export type HyperframesLambdaQuality = "draft" | "standard" | "high";

export type CreateAwsLambdaHyperframesProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly stateMachineArn: string;
  readonly bucketName: string;
  readonly quality?: HyperframesLambdaQuality;
  readonly chunkSize?: number;
  readonly maxParallelChunks?: number;
  readonly targetChunkFrames?: number;
  readonly defaultMemorySizeMb?: number;
  readonly defaultConcurrency?: number;
  readonly pollIntervalMs?: number;
  readonly maxOperationMs?: number;
  readonly maxRenderedBytes?: number;
  readonly client?: HyperframesAwsLambdaClient;
  readonly now?: () => number;
};

type HyperframesHandle = {
  readonly contract: typeof HANDLE_CONTRACT;
  readonly operationId: string;
  readonly executionArn: string;
  readonly outputS3Uri: string;
  readonly bucketName: string;
  readonly site: HyperframesLambdaSite;
  readonly startedAt: number;
  readonly polls: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value >= 0, `${subject} must be a non-negative integer`);
  return value;
}

function stateMachine(value: string): { readonly arn: string; readonly region: string; readonly name: string } {
  const found = /^(arn:aws(?:-[a-z]+)*:states):([a-z0-9-]+):(\d{12}):stateMachine:([A-Za-z0-9_-]+)$/u.exec(value);
  assert(found !== null,
    `HyperFrames stateMachineArn must be an unqualified AWS Step Functions state-machine ARN; got ${value}`);
  return { arn: value, region: found[2]!, name: found[4]! };
}

function executionArn(machine: ReturnType<typeof stateMachine>, executionName: string): string {
  const prefix = machine.arn.slice(0, machine.arn.indexOf(":states") + ":states".length);
  const account = machine.arn.split(":")[4]!;
  return `${prefix}:${machine.region}:${account}:execution:${machine.name}:${executionName}`;
}

function requestDocument(value: CanonicalValue): HyperframesDocument {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "HyperFrames visual request must be an object");
  const request = value as { readonly document?: unknown };
  assert(Object.keys(request).sort().join(",") === "document",
    "HyperFrames visual request contains unsupported requirements");
  assertHyperframesDocument(request.document as HyperframesDocument);
  return request.document as HyperframesDocument;
}

function awsLambdaHyperframesRejection(value: CanonicalValue): string | undefined {
  try {
    const document = requestDocument(value);
    if (document.surfaces.length > 0) return "AWS Lambda HyperFrames does not accept embedded Surfaces";
    if (document.frameRate.denominator !== 1 || !SUPPORTED_FPS.has(document.frameRate.numerator)) {
      return "AWS Lambda HyperFrames accepts integer 24, 30 or 60 fps";
    }
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function supportsAwsLambdaHyperframes(value: CanonicalValue): boolean {
  return awsLambdaHyperframesRejection(value) === undefined;
}

function implementationFailure(code: string, error: unknown): EndpointOutcome {
  return {
    status: "failed",
    failure: {
      code,
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function operationName(operationId: string): string {
  return operationId.replace(/[^A-Za-z0-9_-]/gu, "-").slice(0, 64);
}

function executionName(operationId: string): string {
  return `hypit-${operationName(operationId)}`;
}

function outputKey(operationId: string): string {
  return `renders/hypit/${operationName(operationId)}/visual.mp4`;
}

function alreadyStopped(error: unknown): boolean {
  return error !== null && typeof error === "object"
    && ["ExecutionDoesNotExist", "SFN.ExecutionDoesNotExist", "ExecutionNotRunning"]
      .includes(String((error as { readonly name?: unknown }).name));
}

async function artifactBytes(
  context: EndpointStartContext,
  artifact: BlobRef,
): Promise<Uint8Array | AsyncIterable<Uint8Array>> {
  if (isStreamingResourceStore(context.resources)) {
    const chunks = await context.resources.open(artifact.resource);
    assert(chunks !== undefined, `HyperFrames Artifact ${artifact.resource} is unavailable`);
    return chunks;
  }
  const bytes = await context.resources.get(artifact.resource);
  assert(bytes !== undefined, `HyperFrames Artifact ${artifact.resource} is unavailable`);
  assert(bytes.byteLength === artifact.size, `HyperFrames Artifact ${artifact.resource} size differs`);
  return bytes;
}

function verifySite(site: HyperframesLambdaSite, bucketName: string): void {
  assert(/^[A-Za-z0-9._-]+$/u.test(site.siteId), "HyperFrames site id is invalid");
  assert(site.bucketName === bucketName, "HyperFrames site was deployed to another bucket");
  const target = parseS3Uri(site.projectS3Uri);
  assert(target.bucket === bucketName && target.key === `sites/${site.siteId}/project.tar.gz`,
    "HyperFrames site URI does not name its deployed project");
  positiveInteger(site.bytes, "HyperFrames site bytes");
  assert(Number.isFinite(Date.parse(site.uploadedAt)), "HyperFrames site upload timestamp is invalid");
  assert(typeof site.uploaded === "boolean", "HyperFrames site upload state is invalid");
}

function readHandle(value: CanonicalValue | undefined, context: EndpointPollContext): HyperframesHandle {
  assert(value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value),
    "HyperFrames handle is absent or invalid");
  const item = value as unknown as HyperframesHandle;
  assert(item.contract === HANDLE_CONTRACT, "HyperFrames handle contract is invalid");
  assert(item.operationId === context.operation, "HyperFrames handle Operation differs");
  assert(typeof item.executionArn === "string" && item.executionArn.length > 0,
    "HyperFrames handle execution ARN is missing");
  assert(item.startedAt >= 0 && Number.isSafeInteger(item.startedAt), "HyperFrames handle start time is invalid");
  nonNegativeInteger(item.polls, "HyperFrames handle polls");
  return structuredClone(item);
}

function boundedChunks(
  chunks: AsyncIterable<Uint8Array>,
  maximum: number,
  expected: number | null,
  count: { value: number },
): AsyncIterable<Uint8Array> {
  return (async function* () {
    for await (const chunk of chunks) {
      count.value += chunk.byteLength;
      assert(count.value <= maximum, "HyperFrames output exceeded the configured byte limit");
      if (expected !== null) assert(count.value <= expected, "HyperFrames output exceeded its reported byte count");
      yield chunk;
    }
    assert(count.value > 0, "HyperFrames output is empty");
    if (expected !== null) assert(count.value === expected, "HyperFrames output byte count differs from progress");
  })();
}

async function storeOutput(
  context: EndpointPollContext,
  client: HyperframesAwsLambdaClient,
  progress: HyperframesLambdaProgress,
  handle: HyperframesHandle,
  region: string,
  maxRenderedBytes: number,
): Promise<BlobRef> {
  const output = progress.outputFile;
  assert(output !== null, "HyperFrames succeeded without an output file");
  assert(output.s3Uri === handle.outputS3Uri, "HyperFrames completed at an unexpected output URI");
  const target = parseS3Uri(output.s3Uri);
  assert(target.bucket === handle.bucketName, "HyperFrames output is outside its configured bucket");
  if (output.bytes !== null) positiveInteger(output.bytes, "HyperFrames output bytes");
  const source = await client.openOutput({ s3Uri: output.s3Uri, region });
  if (source.contentLength !== undefined) {
    positiveInteger(source.contentLength, "HyperFrames S3 content length");
    if (output.bytes !== null) assert(source.contentLength === output.bytes,
      "HyperFrames S3 content length differs from progress");
  }
  const expected = output.bytes ?? source.contentLength ?? null;
  if (expected !== null) assert(expected <= maxRenderedBytes,
    "HyperFrames output exceeded the configured byte limit");
  const count = { value: 0 };
  const bounded = boundedChunks(source.chunks, maxRenderedBytes, expected, count);
  if (isStreamingResourceStore(context.resources)) {
    return await context.resources.putStream(bounded, "video/mp4");
  }
  const buffers: Uint8Array[] = [];
  for await (const chunk of bounded) buffers.push(chunk);
  const bytes = new Uint8Array(count.value);
  let offset = 0;
  for (const chunk of buffers) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return await context.resources.put(bytes, "video/mp4");
}

function fulfillment(
  document: HyperframesDocument,
  artifact: BlobRef,
): EndpointFulfillment {
  const value: RenderedVisual = sealRenderedVisual({
    frameRate: document.frameRate,
    frameCount: document.frameCount,
    canvas: document.canvas,
    artifact,
  });
  return { value: { kind: "inline", value: canonicalize(value) } };
}

function renderConfiguration(document: HyperframesDocument, options: {
  readonly quality: HyperframesLambdaQuality;
  readonly chunkSize?: number;
  readonly maxParallelChunks: number;
  readonly targetChunkFrames?: number;
}): HyperframesLambdaRenderConfig {
  assert(document.surfaces.length === 0,
    "AWS Lambda HyperFrames has no deployed Surface-byte verifier");
  assert(document.frameRate.denominator === 1 && SUPPORTED_FPS.has(document.frameRate.numerator),
    "AWS Lambda HyperFrames supports only integer 24, 30 or 60 fps documents");
  return {
    fps: document.frameRate.numerator as 24 | 30 | 60,
    width: document.canvas.width,
    height: document.canvas.height,
    format: "mp4",
    codec: "h264",
    quality: options.quality,
    ...(options.chunkSize === undefined ? {} : { chunkSize: options.chunkSize }),
    maxParallelChunks: options.maxParallelChunks,
    ...(options.targetChunkFrames === undefined ? {} : { targetChunkFrames: options.targetChunkFrames }),
    runtimeCap: "lambda",
    rejectOnSystemFonts: true,
    failClosedFontFetch: true,
    hdrMode: "force-sdr",
    cfr: true,
    entryFile: "index.html",
    strictness: "strict",
  };
}

function verifyProgress(progress: HyperframesLambdaProgress, document: HyperframesDocument): void {
  assert(["RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT", "ABORTED", "PENDING_REDRIVE"]
    .includes(progress.status), "HyperFrames status is invalid");
  assert(Number.isFinite(progress.overallProgress)
    && progress.overallProgress >= 0 && progress.overallProgress <= 1,
  "HyperFrames overall progress is invalid");
  nonNegativeInteger(progress.framesRendered, "HyperFrames rendered frames");
  nonNegativeInteger(progress.lambdasInvoked, "HyperFrames Lambda invocation count");
  assert(Array.isArray(progress.errors), "HyperFrames errors are invalid");
  for (const error of progress.errors) {
    assert(typeof error.state === "string" && typeof error.error === "string"
      && typeof error.cause === "string", "HyperFrames error entry is invalid");
  }
  assert(typeof progress.fatalErrorEncountered === "boolean",
    "HyperFrames fatal-error marker is invalid");
  assert(Number.isFinite(Date.parse(progress.startedAt)), "HyperFrames progress start time is invalid");
  assert(progress.endedAt === null || Number.isFinite(Date.parse(progress.endedAt)),
    "HyperFrames progress end time is invalid");
  if (progress.totalFrames !== null) {
    positiveInteger(progress.totalFrames, "HyperFrames planned frames");
    assert(progress.totalFrames === document.frameCount,
      `HyperFrames planned ${progress.totalFrames} frames for a ${document.frameCount}-frame document`);
    assert(progress.framesRendered <= progress.totalFrames,
      "HyperFrames rendered frame count exceeds its plan");
  }
  if (progress.status === "SUCCEEDED") {
    assert(progress.fatalErrorEncountered === false,
      "HyperFrames succeeded while reporting a fatal error");
    assert(progress.overallProgress === 1,
      "HyperFrames succeeded without reporting complete progress");
    assert(progress.totalFrames === document.frameCount
      && progress.framesRendered === document.frameCount,
    "HyperFrames succeeded without reporting the complete document frame domain");
    assert(progress.outputFile !== null,
      "HyperFrames succeeded without reporting an output file");
  }
}

export function createAwsLambdaHyperframesProvider(config: CreateAwsLambdaHyperframesProviderOptions) {
  const machine = stateMachine(config.stateMachineArn);
  const region = machine.region;
  const quality = config.quality ?? "standard";
  assert(["draft", "standard", "high"].includes(quality), "HyperFrames quality is invalid");
  const chunkSize = config.chunkSize === undefined ? undefined : positiveInteger(config.chunkSize, "chunkSize");
  const maxParallelChunks = positiveInteger(config.maxParallelChunks ?? 16, "maxParallelChunks");
  const targetChunkFrames = config.targetChunkFrames === undefined
    ? undefined : positiveInteger(config.targetChunkFrames, "targetChunkFrames");
  assert(chunkSize === undefined || targetChunkFrames === undefined,
    "HyperFrames chunkSize and targetChunkFrames are mutually exclusive");
  const defaultMemorySizeMb = positiveInteger(config.defaultMemorySizeMb ?? 10_240, "defaultMemorySizeMb");
  const pollIntervalMs = positiveInteger(config.pollIntervalMs ?? 5_000, "pollIntervalMs");
  const maxOperationMs = positiveInteger(config.maxOperationMs ?? 6 * 60 * 60_000, "maxOperationMs");
  const maxRenderedBytes = positiveInteger(config.maxRenderedBytes ?? 16 * 1024 * 1024 * 1024,
    "maxRenderedBytes");
  const client = config.client ?? createHyperframesAwsLambdaClient(region);
  const now = config.now ?? Date.now;

  const makeHandle = (
    context: EndpointStartContext,
    site: HyperframesLambdaSite,
    handle: HyperframesLambdaRender,
    startedAt: number,
  ): HyperframesHandle => {
    return {
      contract: HANDLE_CONTRACT,
      operationId: context.operation,
      executionArn: handle.executionArn,
      outputS3Uri: handle.outputS3Uri,
      bucketName: handle.bucketName,
      site,
      startedAt,
      polls: 0,
    };
  };

  const submit = async (context: EndpointStartContext): Promise<EndpointOutcome> => {
    const startedAt = now();
    const document = requestDocument(context.need.constraints);
    const renderConfig = renderConfiguration(document, {
      quality,
      ...(chunkSize === undefined ? {} : { chunkSize }),
      maxParallelChunks,
      ...(targetChunkFrames === undefined ? {} : { targetChunkFrames }),
    });
    let site: HyperframesLambdaSite;
    const work = await mkdtemp(join(tmpdir(), "hypit-hyperframes-aws-"));
    try {
      await stageHyperframesProject({
        document,
        directory: work,
        read: (artifact) => artifactBytes(context, artifact),
      });
      site = await client.deploySite({ projectDir: work, bucketName: config.bucketName, region });
    } catch (error) {
      return implementationFailure("HYPERFRAMES_SITE_DEPLOY_FAILED", error);
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
    verifySite(site, config.bucketName);
    let render: HyperframesLambdaRender;
    try {
      render = await client.render({
        siteHandle: site,
        config: renderConfig,
        bucketName: config.bucketName,
        stateMachineArn: machine.arn,
        region,
        outputKey: outputKey(context.operation),
        executionName: executionName(context.operation),
      });
      const handle = makeHandle(context, site, render, startedAt);
      const receipt = { id: handle.executionArn };
      await context.checkpoint?.({ handle: canonicalize(handle), receipt });
      return { ...wakeAfter(canonicalize(handle), pollIntervalMs, now(), { phase: "submitted" }), receipt };
    } catch (error) {
      return implementationFailure("HYPERFRAMES_SUBMISSION_FAILED", error);
    }
  };

  const safeSubmit = async (
    context: EndpointStartContext,
  ): Promise<EndpointOutcome> => {
    try {
      return await submit(context);
    } catch (error) {
      return implementationFailure("HYPERFRAMES_SUBMISSION_INVALID", error);
    }
  };

  const endpoint: AsyncEndpoint = {
    start: async (context) => await safeSubmit(context),
    async poll(context) {
      let handle: HyperframesHandle;
      try {
        handle = readHandle(context.handle, context);
      } catch (error) {
        throw error;
      }
      if (now() - handle.startedAt >= maxOperationMs) {
        return implementationFailure("HYPERFRAMES_OPERATION_TIMEOUT", new Error("HyperFrames deadline exceeded"));
      }
      let document: HyperframesDocument;
      let progress: HyperframesLambdaProgress;
      try {
        document = requestDocument(context.need.constraints);
        progress = await client.progress({
          executionArn: handle.executionArn,
          defaultMemorySizeMb,
          region,
        });
      } catch (error) {
        return implementationFailure("HYPERFRAMES_POLL_FAILED", error);
      }
      try {
        verifyProgress(progress, document);
      } catch (error) {
        return implementationFailure("HYPERFRAMES_POLL_FAILED", error);
      }
      const next = { ...handle, polls: handle.polls + 1 };
      if (progress.status === "RUNNING") {
        return wakeAfter(canonicalize(next), pollIntervalMs, now(), {
          phase: "rendering",
          completed: progress.framesRendered,
          ...(progress.totalFrames === null ? {} : { total: progress.totalFrames }),
          unit: "frames",
        });
      }
      if (progress.status !== "SUCCEEDED") {
        const details = progress.errors.map((item) => `${item.state}: ${item.error}: ${item.cause}`).join("; ");
        return implementationFailure(`HYPERFRAMES_${progress.status}`,
          new Error(details || `HyperFrames execution ended as ${progress.status}`));
      }
      try {
        const artifact = await storeOutput(context, client, progress, next, region, maxRenderedBytes);
        return {
          status: "completed",
          result: fulfillment(document, artifact),
        };
      } catch (error) {
        return implementationFailure("HYPERFRAMES_OUTPUT_INVALID", error);
      }
    },
    async cancel(context) {
      const target = readHandle(context.handle, context).executionArn;
      try {
        await client.stop({
          executionArn: target,
          region,
          reason: `Hypit cancelled Operation ${context.operation}`,
        });
      } catch (error) {
        if (!alreadyStopped(error)) throw error;
      }
      return { status: "accepted" };
    },
  };

  return defineEndpointPackage({
    module: awsLambdaHyperframesProviderModuleRef,
    facet: "render",
    instance: config.instance ?? "hyperframes.aws-lambda",
    pool: config.pool ?? config.instance ?? "hyperframes.aws-lambda",
    pricing: { kind: "page", url: "https://aws.amazon.com/lambda/pricing/" },
    defaultConcurrency: config.defaultConcurrency ?? 2,
    capabilities: [{
      lifecycle: "asynchronous" as const,
      capability: renderHyperframesCapabilities.renderVisual,
      returns: mediaTypes.renderedVisual,
      supports: (need) => {
        const reason = awsLambdaHyperframesRejection(need.constraints);
        return reason === undefined ? { status: "supported" } : { status: "unsupported", reason };
      },
      endpoint,
    }],
  });
}
