import { AwsS3ObjectClient, S3ArtifactStore } from "@narratage/artifact-store-s3";
import type { S3ObjectClient } from "@narratage/artifact-store-s3";
import {
  executeInspectMedia,
  executeExtractAudio,
  executeExtractFrame,
  executeMuxProgramMedia,
  executeNormalizeMedia,
  executeProjectSpeechEvidenceAudio,
  executeRenderTimelineAudio,
  executeTransformMedia,
} from "@narratage/media-execution";
import type { MediaExecutionEnvironment, MediaOperationResult } from "@narratage/media-execution";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { BlobRef, CanonicalValue, Digest } from "@narratage/protocol";
import {
  MEDIA_LAMBDA_RESPONSE,
  parseMediaLambdaRequest,
} from "@narratage/provider-media-aws-lambda";
import type { MediaLambdaArtifactLocation, MediaLambdaOperation } from "@narratage/provider-media-aws-lambda";

/**
 * The whole function.
 *
 * It owns no media logic: `@narratage/media-execution` holds the ffmpeg argv
 * and the frame arithmetic, and the same code answers a local Build. What is
 * particular to this deployment is only where the bytes live and which ffmpeg
 * binary its immutable Layer carries.
 */
const OPERATIONS: Record<
  MediaLambdaOperation,
  (env: MediaExecutionEnvironment, constraints: CanonicalValue) => Promise<MediaOperationResult>
> = {
  "inspect": executeInspectMedia,
  "normalize": executeNormalizeMedia,
  "transform": executeTransformMedia,
  "extract-audio": executeExtractAudio,
  "extract-frame": executeExtractFrame,
  "project-speech-evidence-audio": executeProjectSpeechEvidenceAudio,
  "render-audio": executeRenderTimelineAudio,
  "mux": executeMuxProgramMedia,
};

const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "/opt/bin/ffmpeg";
const FFPROBE_PATH = process.env.FFPROBE_PATH ?? "/opt/bin/ffprobe";
const FFMPEG_LIBRARY_PATH = process.env.NARRATAGE_FFMPEG_LIBRARY_PATH;
const run = promisify(execFile);

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${value} is not a positive integer`);
  return parsed;
}

/**
 * The bucket, addressed by the same content-addressing rule the ArtifactStore
 * uses. Writes are conditional, so two functions racing on identical bytes
 * agree rather than conflict.
 */
function gateway(location: MediaLambdaArtifactLocation, client: S3ObjectClient) {
  const store = new S3ArtifactStore({
    bucket: location.bucket,
    ...(location.prefix === undefined ? {} : { prefix: location.prefix }),
    client,
  });
  return {
    async get(source: BlobRef): Promise<Uint8Array | undefined> {
      return await store.get(source.digest);
    },
    async open(source: BlobRef): Promise<AsyncIterable<Uint8Array> | undefined> {
      if (store.open !== undefined) return await store.open(source.digest);
      const bytes = await store.get(source.digest);
      return bytes === undefined ? undefined : (async function* () { yield bytes; })();
    },
    async put(bytes: Uint8Array, mediaType: string): Promise<BlobRef> {
      return await store.put(bytes, mediaType);
    },
    async putFile(path: string, mediaType: string): Promise<BlobRef> {
      return store.putStream === undefined
        ? await store.put(await readFile(path), mediaType)
        : await store.putStream(createReadStream(path), mediaType);
    },
  };
}

function failure(operation: MediaLambdaOperation, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    contract: MEDIA_LAMBDA_RESPONSE,
    operation,
    ok: false as const,
    code: "MEDIA_OPERATION_FAILED",
    message,
  };
}

export type MediaLambdaHandlerOptions = {
  /** Injection point for tests, MinIO and specially configured trusted AWS clients. */
  readonly client?: S3ObjectClient;
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly sharedLibraryPath?: string;
  /**
   * The deployed ZIP sets this to the version promised by its immutable Layer.
   * Tests and embedded handlers may omit it when their binary identity is
   * already controlled by the caller.
   */
  readonly expectedFfmpegVersion?: string;
};

function versionMatches(line: string, tool: "ffmpeg" | "ffprobe", expected: string): boolean {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${tool} version (?:n)?${escaped}(?:[-\\s]|$)`, "u").test(line);
}

async function assertBinaryVersion(
  path: string,
  tool: "ffmpeg" | "ffprobe",
  expected: string,
  sharedLibraryPath?: string,
): Promise<void> {
  const { stdout } = await run(path, ["-version"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
    timeout: 10_000,
    env: {
      ...process.env,
      ...(sharedLibraryPath === undefined ? {} : { LD_LIBRARY_PATH: sharedLibraryPath }),
    },
  });
  const firstLine = stdout.split(/\r?\n/u, 1)[0] ?? "";
  if (!versionMatches(firstLine, tool, expected)) {
    throw new Error(`${tool} Layer mismatch: expected ${expected}, got ${firstLine || "no version"}`);
  }
}

async function assertBinaryPair(
  ffmpegPath: string,
  ffprobePath: string,
  expected: string | undefined,
  sharedLibraryPath?: string,
): Promise<void> {
  if (expected === undefined) return;
  await Promise.all([
    assertBinaryVersion(ffmpegPath, "ffmpeg", expected, sharedLibraryPath),
    assertBinaryVersion(ffprobePath, "ffprobe", expected, sharedLibraryPath),
  ]);
}

/**
 * The handler, with its S3 client and binaries open to substitution. The
 * deployed entry point below closes them over the Layer's fixed paths; a test
 * can supply an in-memory bucket and run the real ffmpeg.
 */
export function createMediaLambdaHandler(options: MediaLambdaHandlerOptions = {}) {
  const ffmpegPath = options.ffmpegPath ?? FFMPEG_PATH;
  const ffprobePath = options.ffprobePath ?? FFPROBE_PATH;
  const sharedLibraryPath = options.sharedLibraryPath ?? FFMPEG_LIBRARY_PATH;
  // One promise per warm execution environment. A missing or wrong Layer is a
  // typed fulfillment failure, not a deployment fact silently discovered after
  // several expensive transformations have already run.
  let binariesReady: Promise<void> | undefined;
  return async function handle(event: unknown): Promise<unknown> {
    let operation: MediaLambdaOperation = "inspect";
    try {
      const request = parseMediaLambdaRequest(event);
      operation = request.operation;
      binariesReady ??= assertBinaryPair(
        ffmpegPath,
        ffprobePath,
        options.expectedFfmpegVersion ?? process.env.NARRATAGE_FFMPEG_VERSION,
        sharedLibraryPath,
      );
      await binariesReady;
      const env: MediaExecutionEnvironment = {
        artifacts: gateway(request.artifacts, options.client ?? new AwsS3ObjectClient({})),
        ffmpegPath,
        ffprobePath,
        ...(sharedLibraryPath === undefined ? {} : { sharedLibraryPath }),
        processTimeoutMs: positiveInteger(process.env.SVML_MEDIA_TIMEOUT_MS, 14 * 60_000),
        maxProbeOutputBytes: positiveInteger(process.env.SVML_MEDIA_MAX_PROBE_BYTES, 256 * 1024 * 1024),
        label: "media.aws-lambda",
      };
      const result = await OPERATIONS[operation](env, request.constraints);
      return {
        contract: MEDIA_LAMBDA_RESPONSE,
        operation,
        ok: true as const,
        value: result.value,
        metadata: result.metadata,
      };
    } catch (error) {
      // Never thrown: the transport will not copy a failed function's payload
      // into its error, so a throw would reach the Build as "Unhandled".
      return failure(operation, error);
    }
  };
}

/** The managed-runtime ZIP's entry point. */
export const handler = createMediaLambdaHandler();
