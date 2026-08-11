import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  defineEndpointPackage,
  wakeAfter,
} from "@narratage/endpoint-kit";
import type {
  EndpointFulfillment,
  EndpointOutcome,
  EndpointResumeContext,
  EndpointStartContext,
  RecoverableEndpoint,
} from "@narratage/endpoint-kit";
import {
  assertHyperframesDocument,
} from "@narratage/hyperframes";
import type { HyperframesDocument } from "@narratage/hyperframes";
import { stageHyperframesProject } from "@narratage/hyperframes/project";
import {
  mediaTypes,
  sealRenderedVisual,
} from "@narratage/media";
import type { RenderedVisual } from "@narratage/media";
import {
  canonicalize,
  digestOf,
  isDigest,
} from "@narratage/protocol";
import type {
  BlobRef,
  CanonicalValue,
  Digest,
} from "@narratage/protocol";
import { renderHyperframesCapabilities } from "@narratage/render-hyperframes";
import { isStreamingArtifactStore } from "@narratage/runtime";

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

const HYPERFRAMES_VERSION = "0.7.101";
const REQUEST_CONTRACT = "svml.hyperframes-visual-render-request@1";
const CHECKPOINT_CONTRACT = "svml.hyperframes-aws-lambda-operation@1";
const SUPPORTED_FPS = new Set([24, 30, 60]);

export const awsLambdaHyperframesProviderModuleRef = {
  name: "@narratage/provider-hyperframes-aws-lambda",
  version: "1",
} as const;
export const awsLambdaHyperframesProviderImplementationDigest = digestOf(
  `@narratage/provider-hyperframes-aws-lambda/render@1+hyperframes@${HYPERFRAMES_VERSION}`,
);

export type HyperframesLambdaQuality = "draft" | "standard" | "high";

export type CreateAwsLambdaHyperframesProviderOptions = {
  readonly instance?: string;
  readonly lane?: string;
  readonly stateMachineArn: string;
  readonly bucketName: string;
  /** Content identity of the deployed remote renderer, not merely its mutable ARN. */
  readonly rendererImplementationDigest: Digest;
  readonly region?: string;
  readonly quality?: HyperframesLambdaQuality;
  readonly chunkSize?: number;
  readonly maxParallelChunks?: number;
  readonly targetChunkFrames?: number;
  readonly defaultMemorySizeMb?: number;
  readonly defaultConcurrency?: number;
  readonly pollIntervalMs?: number;
  readonly maxOperationMs?: number;
  readonly maxRenderedBytes?: number;
  readonly maxPollFailures?: number;
  readonly maxAttempts?: number;
  /** Required when injecting anything other than the locked official SDK client. */
  readonly clientImplementationDigest?: Digest;
  readonly client?: HyperframesAwsLambdaClient;
  readonly now?: () => number;
};

type HyperframesCheckpoint = {
  readonly contract: typeof CHECKPOINT_CONTRACT;
  readonly requestDigest: Digest;
  readonly submissionKey: Digest;
  readonly executionName: string;
  readonly executionArn: string;
  readonly renderId: string;
  readonly outputS3Uri: string;
  readonly stateMachineArn: string;
  readonly bucketName: string;
  readonly site: HyperframesLambdaSite;
  readonly startedAt: number;
  readonly polls: number;
  readonly pollFailures: number;
  readonly submission: "confirmed" | "unknown";
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
  const request = value as { readonly contract?: unknown; readonly document?: unknown };
  assert(request.contract === REQUEST_CONTRACT, "HyperFrames visual request contract is invalid");
  assert(Object.keys(request).sort().join(",") === "contract,document",
    "HyperFrames visual request contains unsupported requirements");
  assertHyperframesDocument(request.document as HyperframesDocument);
  return request.document as HyperframesDocument;
}

export function supportsAwsLambdaHyperframes(value: CanonicalValue): boolean {
  try {
    const document = requestDocument(value);
    return document.surfaces.length === 0
      && document.frameRate.denominator === 1
      && SUPPORTED_FPS.has(document.frameRate.numerator);
  } catch {
    return false;
  }
}

function implementationFailure(code: string, error: unknown, retryable: boolean): EndpointOutcome {
  return {
    status: "failed",
    failure: {
      code,
      message: error instanceof Error ? error.message : String(error),
      retryable,
    },
  };
}

function executionName(submissionKey: Digest): string {
  return `narratage-${submissionKey.slice("sha256:".length)}`;
}

function outputKey(submissionKey: Digest): string {
  return `renders/narratage/${submissionKey.slice("sha256:".length)}/visual.mp4`;
}

function expectedOutputUri(bucketName: string, key: string): string {
  return `s3://${bucketName}/${key}`;
}

function sameRender(actual: HyperframesLambdaRender, expected: {
  readonly executionName: string;
  readonly executionArn: string;
  readonly outputS3Uri: string;
  readonly stateMachineArn: string;
  readonly bucketName: string;
  readonly projectS3Uri: string;
}): void {
  assert(actual.renderId === expected.executionName, "HyperFrames render id differs from its submission key");
  assert(actual.executionArn === expected.executionArn, "HyperFrames execution ARN differs from its deterministic identity");
  assert(actual.outputS3Uri === expected.outputS3Uri, "HyperFrames output URI differs from its deterministic key");
  assert(actual.stateMachineArn === expected.stateMachineArn, "HyperFrames render used another state machine");
  assert(actual.bucketName === expected.bucketName, "HyperFrames render used another bucket");
  assert(actual.projectS3Uri === expected.projectS3Uri, "HyperFrames render used another staged project");
}

function duplicateExecution(error: unknown): boolean {
  return error !== null && typeof error === "object"
    && (error as { readonly name?: unknown }).name === "ExecutionAlreadyExists";
}

function rejectedSubmission(error: unknown): { readonly code: string; readonly retryable: boolean } | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const name = String((error as { readonly name?: unknown }).name);
  if (["ExecutionLimitExceeded", "KmsThrottlingException", "ThrottlingException"].includes(name)) {
    return { code: "HYPERFRAMES_SUBMISSION_THROTTLED", retryable: true };
  }
  if ([
    "InvalidConfigError", "ValidationException", "InvalidArn", "InvalidExecutionInput", "InvalidName",
    "AccessDeniedException", "KmsAccessDeniedException", "KmsInvalidStateException",
    "StateMachineDeleting", "StateMachineDoesNotExist",
  ].includes(name)) {
    return { code: "HYPERFRAMES_SUBMISSION_REJECTED", retryable: false };
  }
  return undefined;
}

function missingExecution(error: unknown): boolean {
  return error !== null && typeof error === "object"
    && ["ExecutionDoesNotExist", "SFN.ExecutionDoesNotExist"].includes(
      String((error as { readonly name?: unknown }).name),
    );
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
  if (isStreamingArtifactStore(context.artifacts)) {
    const chunks = await context.artifacts.open(artifact.digest);
    assert(chunks !== undefined, `HyperFrames Artifact ${artifact.digest} is unavailable`);
    return chunks;
  }
  const bytes = await context.artifacts.get(artifact.digest);
  assert(bytes !== undefined, `HyperFrames Artifact ${artifact.digest} is unavailable`);
  assert(bytes.byteLength === artifact.size, `HyperFrames Artifact ${artifact.digest} size differs`);
  return bytes;
}

function verifySite(site: HyperframesLambdaSite, bucketName: string): void {
  assert(/^[A-Za-z0-9._-]+$/u.test(site.siteId), "HyperFrames site id is invalid");
  assert(site.bucketName === bucketName, "HyperFrames site was deployed to another bucket");
  const target = parseS3Uri(site.projectS3Uri);
  assert(target.bucket === bucketName && target.key === `sites/${site.siteId}/project.tar.gz`,
    "HyperFrames site URI does not name its content-addressed project");
  positiveInteger(site.bytes, "HyperFrames site bytes");
  assert(Number.isFinite(Date.parse(site.uploadedAt)), "HyperFrames site upload timestamp is invalid");
  assert(typeof site.uploaded === "boolean", "HyperFrames site upload state is invalid");
}

function verifyCheckpoint(value: CanonicalValue | undefined, context: EndpointResumeContext): HyperframesCheckpoint {
  assert(value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value),
    "HyperFrames checkpoint is absent or invalid");
  const item = value as unknown as HyperframesCheckpoint;
  assert(item.contract === CHECKPOINT_CONTRACT, "HyperFrames checkpoint contract is invalid");
  assert(item.requestDigest === context.need.requestDigest, "HyperFrames checkpoint request differs");
  assert(item.submissionKey === context.operation.submissionKey, "HyperFrames checkpoint submission differs");
  assert(item.executionName === executionName(context.operation.submissionKey),
    "HyperFrames checkpoint execution name differs");
  assert(item.renderId === item.executionName, "HyperFrames checkpoint render id differs");
  assert(isDigest(item.requestDigest) && isDigest(item.submissionKey), "HyperFrames checkpoint digest is invalid");
  assert(item.startedAt >= 0 && Number.isSafeInteger(item.startedAt), "HyperFrames checkpoint start time is invalid");
  nonNegativeInteger(item.polls, "HyperFrames checkpoint polls");
  nonNegativeInteger(item.pollFailures, "HyperFrames checkpoint poll failures");
  assert(item.submission === "confirmed" || item.submission === "unknown",
    "HyperFrames checkpoint submission state is invalid");
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
  context: EndpointResumeContext,
  client: HyperframesAwsLambdaClient,
  progress: HyperframesLambdaProgress,
  checkpoint: HyperframesCheckpoint,
  region: string,
  maxRenderedBytes: number,
): Promise<BlobRef> {
  const output = progress.outputFile;
  assert(output !== null, "HyperFrames succeeded without an output file");
  assert(output.s3Uri === checkpoint.outputS3Uri, "HyperFrames completed at an unexpected output URI");
  const target = parseS3Uri(output.s3Uri);
  assert(target.bucket === checkpoint.bucketName, "HyperFrames output is outside its configured bucket");
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
  if (isStreamingArtifactStore(context.artifacts)) {
    return await context.artifacts.putStream(bounded, "video/mp4");
  }
  const buffers: Uint8Array[] = [];
  for await (const chunk of bounded) buffers.push(chunk);
  const bytes = new Uint8Array(count.value);
  let offset = 0;
  for (const chunk of buffers) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return await context.artifacts.put(bytes, "video/mp4");
}

function fulfillment(
  document: HyperframesDocument,
  artifact: BlobRef,
  checkpoint: HyperframesCheckpoint,
  progress: HyperframesLambdaProgress,
  rendererImplementationDigest: Digest,
): EndpointFulfillment {
  const value: RenderedVisual = sealRenderedVisual({
    contract: "svml.rendered-visual@1",
    frameRate: document.frameRate,
    frameCount: document.frameCount,
    canvas: document.canvas,
    artifact,
    muted: true,
  });
  return {
    value: { kind: "inline", value: canonicalize(value) },
    conformance: "exact",
    delivery: "executed",
    metadata: canonicalize({
      contract: "svml.hyperframes-renderer-attestation@1",
      provider: "hyperframes.aws-lambda",
      providerImplementationDigest: awsLambdaHyperframesProviderImplementationDigest,
      rendererImplementationDigest,
      documentDigest: digestOf(document),
      hyperframesVersion: HYPERFRAMES_VERSION,
      renderId: checkpoint.renderId,
      executionArn: checkpoint.executionArn,
      siteId: checkpoint.site.siteId,
      framesRendered: progress.framesRendered,
      lambdasInvoked: progress.lambdasInvoked,
      costs: progress.costs as unknown as CanonicalValue,
      validation: "hyperframes-progress@1",
    }),
  };
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
  const region = config.region ?? machine.region;
  assert(region === machine.region,
    `HyperFrames region ${region} differs from state machine region ${machine.region}`);
  assert(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(config.bucketName)
    && !config.bucketName.includes("..")
    && !config.bucketName.includes(".-")
    && !config.bucketName.includes("-.")
    && !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(config.bucketName),
    "HyperFrames bucketName is invalid");
  assert(isDigest(config.rendererImplementationDigest),
    "HyperFrames rendererImplementationDigest is invalid");
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
  const maxPollFailures = positiveInteger(config.maxPollFailures ?? 5, "maxPollFailures");
  const maxAttempts = positiveInteger(config.maxAttempts ?? 1, "maxAttempts");
  if (config.client !== undefined && config.clientImplementationDigest === undefined) {
    throw new Error("custom HyperFrames AWS client requires clientImplementationDigest");
  }
  if (config.clientImplementationDigest !== undefined && !isDigest(config.clientImplementationDigest)) {
    throw new Error("HyperFrames AWS clientImplementationDigest is invalid");
  }
  const clientImplementationDigest = config.clientImplementationDigest
    ?? digestOf(`@narratage/provider-hyperframes-aws-lambda/official-sdk@${HYPERFRAMES_VERSION}`);
  const client = config.client ?? createHyperframesAwsLambdaClient(region);
  const now = config.now ?? Date.now;

  const makeCheckpoint = (
    context: EndpointStartContext,
    site: HyperframesLambdaSite,
    submission: HyperframesCheckpoint["submission"],
    startedAt: number,
  ): HyperframesCheckpoint => {
    const name = executionName(context.operation.submissionKey);
    const output = expectedOutputUri(config.bucketName, outputKey(context.operation.submissionKey));
    const expectedArn = executionArn(machine, name);
    return {
      contract: CHECKPOINT_CONTRACT,
      requestDigest: context.need.requestDigest,
      submissionKey: context.operation.submissionKey,
      executionName: name,
      executionArn: expectedArn,
      renderId: name,
      outputS3Uri: output,
      stateMachineArn: machine.arn,
      bucketName: config.bucketName,
      site,
      startedAt,
      polls: 0,
      pollFailures: 0,
      submission,
    };
  };

  const submit = async (
    context: EndpointStartContext,
    existingSite?: HyperframesLambdaSite,
    existingStartedAt?: number,
  ): Promise<EndpointOutcome> => {
    const startedAt = existingStartedAt ?? now();
    const document = requestDocument(context.need.constraints);
    const renderConfig = renderConfiguration(document, {
      quality,
      ...(chunkSize === undefined ? {} : { chunkSize }),
      maxParallelChunks,
      ...(targetChunkFrames === undefined ? {} : { targetChunkFrames }),
    });
    let site = existingSite;
    if (site === undefined) {
      const work = await mkdtemp(join(tmpdir(), "svml-hyperframes-aws-"));
      try {
        await stageHyperframesProject({
          document,
          directory: work,
          read: (artifact) => artifactBytes(context, artifact),
        });
        site = await client.deploySite({ projectDir: work, bucketName: config.bucketName, region });
      } catch (error) {
        return implementationFailure("HYPERFRAMES_SITE_DEPLOY_FAILED", error, true);
      } finally {
        await rm(work, { recursive: true, force: true }).catch(() => {});
      }
    }
    verifySite(site, config.bucketName);
    const checkpoint = makeCheckpoint(context, site, "unknown", startedAt);
    let handle: HyperframesLambdaRender;
    try {
      handle = await client.render({
        siteHandle: site,
        config: renderConfig,
        bucketName: config.bucketName,
        stateMachineArn: machine.arn,
        region,
        outputKey: outputKey(context.operation.submissionKey),
        executionName: checkpoint.executionName,
      });
    } catch (error) {
      if (duplicateExecution(error)) {
        return wakeAfter(canonicalize({ ...checkpoint, submission: "confirmed" }), pollIntervalMs, now(), {
          phase: "submitted",
        });
      }
      const rejected = rejectedSubmission(error);
      if (rejected !== undefined) return implementationFailure(rejected.code, error, rejected.retryable);
      // StartExecution may have reached AWS even when its response did not reach us. The
      // deterministic execution name makes polling this derived ARN safer than submitting a new job.
      return wakeAfter(canonicalize(checkpoint), pollIntervalMs, now(), {
        phase: "confirming-submission",
      });
    }
    try {
      sameRender(handle, {
        executionName: checkpoint.executionName,
        executionArn: checkpoint.executionArn,
        outputS3Uri: checkpoint.outputS3Uri,
        stateMachineArn: checkpoint.stateMachineArn,
        bucketName: checkpoint.bucketName,
        projectS3Uri: checkpoint.site.projectS3Uri,
      });
    } catch (error) {
      return implementationFailure("HYPERFRAMES_SUBMISSION_IDENTITY_MISMATCH", error, false);
    }
    return wakeAfter(canonicalize({ ...checkpoint, submission: "confirmed" }), pollIntervalMs, now(), {
      phase: "submitted",
    });
  };

  const safeSubmit = async (
    context: EndpointStartContext,
    existingSite?: HyperframesLambdaSite,
    existingStartedAt?: number,
  ): Promise<EndpointOutcome> => {
    try {
      return await submit(context, existingSite, existingStartedAt);
    } catch (error) {
      return implementationFailure("HYPERFRAMES_SUBMISSION_INVALID", error, false);
    }
  };

  const endpoint: RecoverableEndpoint = {
    start: async (context) => await safeSubmit(context),
    async resume(context) {
      if (context.checkpoint === undefined) return await safeSubmit(context);
      let checkpoint: HyperframesCheckpoint;
      try {
        checkpoint = verifyCheckpoint(context.checkpoint, context);
        verifySite(checkpoint.site, config.bucketName);
        assert(checkpoint.stateMachineArn === machine.arn && checkpoint.bucketName === config.bucketName,
          "HyperFrames checkpoint deployment differs");
        assert(checkpoint.executionArn === executionArn(machine, checkpoint.executionName),
          "HyperFrames checkpoint execution ARN differs");
        assert(checkpoint.outputS3Uri === expectedOutputUri(config.bucketName, outputKey(context.operation.submissionKey)),
          "HyperFrames checkpoint output URI differs");
      } catch (error) {
        return implementationFailure("HYPERFRAMES_CHECKPOINT_INVALID", error, false);
      }
      if (now() - checkpoint.startedAt >= maxOperationMs) {
        return implementationFailure("HYPERFRAMES_OPERATION_TIMEOUT",
          new Error("HyperFrames render exceeded its operation deadline"), false);
      }
      let document: HyperframesDocument;
      let progress: HyperframesLambdaProgress;
      try {
        document = requestDocument(context.need.constraints);
        progress = await client.progress({
          executionArn: checkpoint.executionArn,
          defaultMemorySizeMb,
          region,
        });
      } catch (error) {
        if (checkpoint.submission === "unknown" && missingExecution(error)) {
          return await safeSubmit(context, checkpoint.site, checkpoint.startedAt);
        }
        const failures = checkpoint.pollFailures + 1;
        if (failures >= maxPollFailures) {
          return implementationFailure("HYPERFRAMES_PROGRESS_UNAVAILABLE", error, true);
        }
        return wakeAfter(canonicalize({ ...checkpoint, pollFailures: failures }), pollIntervalMs, now(), {
          phase: "progress-retry",
        });
      }
      try {
        verifyProgress(progress, document);
      } catch (error) {
        return implementationFailure("HYPERFRAMES_PROGRESS_INVALID", error, false);
      }
      const next = { ...checkpoint, submission: "confirmed" as const,
        polls: checkpoint.polls + 1, pollFailures: 0 };
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
          new Error(details || `HyperFrames execution ended as ${progress.status}`),
          progress.status === "FAILED" || progress.status === "TIMED_OUT" || progress.status === "PENDING_REDRIVE");
      }
      try {
        const artifact = await storeOutput(context, client, progress, next, region, maxRenderedBytes);
        return {
          status: "completed",
          result: fulfillment(document, artifact, next, progress, config.rendererImplementationDigest),
        };
      } catch (error) {
        return implementationFailure("HYPERFRAMES_OUTPUT_INVALID", error, true);
      }
    },
    async cancel(context) {
      const target = executionArn(machine, executionName(context.operation.submissionKey));
      if (context.checkpoint !== undefined) {
        const checkpoint = verifyCheckpoint(context.checkpoint, context);
        verifySite(checkpoint.site, config.bucketName);
        assert(checkpoint.stateMachineArn === machine.arn && checkpoint.bucketName === config.bucketName,
          "HyperFrames checkpoint deployment differs");
        assert(checkpoint.executionArn === target,
          "HyperFrames checkpoint execution ARN differs");
      }
      try {
        await client.stop({
          executionArn: target,
          region,
          reason: `Narratage cancelled Operation ${context.operation.id}`,
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
    ...(config.lane === undefined ? {} : { lane: config.lane }),
    implementation: {
      locator: "@narratage/provider-hyperframes-aws-lambda/render",
      digest: awsLambdaHyperframesProviderImplementationDigest,
    },
    permissions: ["network:aws:s3", "network:aws:states"],
    configuration: canonicalize({
      stateMachineArn: machine.arn,
      bucketName: config.bucketName,
      rendererImplementationDigest: config.rendererImplementationDigest,
      region,
      hyperframesVersion: HYPERFRAMES_VERSION,
      planProtocol: "v2",
      quality,
      ...(chunkSize === undefined ? {} : { chunkSize }),
      maxParallelChunks,
      ...(targetChunkFrames === undefined ? {} : { targetChunkFrames }),
      defaultMemorySizeMb,
      pollIntervalMs,
      maxOperationMs,
      maxRenderedBytes,
      maxPollFailures,
      clientImplementationDigest,
    }),
    defaultConcurrency: config.defaultConcurrency ?? 2,
    capabilities: [{
      lifecycle: "recoverable" as const,
      capability: renderHyperframesCapabilities.renderVisual,
      returns: mediaTypes.renderedVisual,
      supports: (need) => supportsAwsLambdaHyperframes(need.constraints),
      endpoint,
      retry: { maxAttempts },
    }],
  });
}
