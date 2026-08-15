import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaTypes, sealMediaInspection, sealMuxedMedia, sealSynchronizedMedia, sealTimelineAudio, verifyMediaInspection, verifyMediaStreamSelection, verifyRenderedVisual, verifySynchronizedMedia, verifyTimelineAudio } from "@narratage/media";
import type { MediaAudioStream, MediaInspection, MediaRational, MediaStream, MediaStreamSelection, MediaTimestamp, MediaVideoStream, MuxedMedia, RenderedVisual, SynchronizedMedia, TimelineAudio } from "@narratage/media";
import type { ProgramSpace } from "@narratage/program-space";
import { assertSpeechEvidenceAudioIdentity, sealSpeechEvidenceAudio, speechEvidenceSampleBoundary, speechTypes } from "@narratage/speech";
import type { SpeechEvidenceAudio } from "@narratage/speech";
import {
  mediaPipelineCapabilities,
  verifyAudioExtractionRequest,
  verifyAudioProgramPlan,
  verifyFrameExtractionRequest,
  verifyMediaTransformProgram,
  type ExtractAudioNeed,
  type ExtractFrameNeed,
  type InspectMediaNeed,
  type MuxMediaNeed,
  type NormalizeMediaNeed,
  type ProjectSpeechEvidenceAudioNeed,
  type RenderAudioNeed,
  type TransformMediaNeed,
} from "@narratage/media-pipeline";
import type { AudioProgramClip, AudioProgramPlan, MediaTransformOperation } from "@narratage/media-pipeline";
import {
  canonicalize,
  digestOf,
} from "@narratage/protocol";
import type { BlobRef, CanonicalValue, StoredValue } from "@narratage/protocol";

import { parseMediaInspection } from "./probe.js";
import {
  compositeAnimatedWebpFrame,
  createAnimatedWebpCanvas,
  pamRgba,
  parseAnimatedWebp,
} from "./webp.js";
import type { AnimatedWebp } from "./webp.js";

/**
 * Where the bytes live and which binaries transform them.
 *
 * These byte operations are the whole of Narratage's media execution, and they
 * are written once. A local Provider supplies the Build's own ArtifactStore and
 * the ffmpeg on its PATH; a Lambda Provider supplies an S3-backed gateway and
 * the ffmpeg carried by its deployment. Nothing below knows which it is, so the two
 * deployments cannot drift into computing different media from one Need.
 */
export type MediaArtifactGateway = {
  get(source: BlobRef): Promise<Uint8Array | undefined>;
  open(source: BlobRef): Promise<AsyncIterable<Uint8Array> | undefined>;
  put(bytes: Uint8Array, mediaType: string): Promise<BlobRef>;
  putFile(path: string, mediaType: string): Promise<BlobRef>;
};

export type MediaExecutionEnvironment = {
  readonly artifacts: MediaArtifactGateway;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  /** Deployment fact for dynamically linked tool bundles; absent for ordinary local binaries. */
  readonly sharedLibraryPath?: string;
  readonly processTimeoutMs: number;
  readonly maxProbeOutputBytes: number;
};

export type MediaOperationResult = {
  readonly value: StoredValue;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} must be an object`);
  return value as Record<string, unknown>;
}

async function runProcess(args: {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly sharedLibraryPath?: string;
}): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const child = spawn(args.executable, [...args.argv], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        ...(args.sharedLibraryPath === undefined ? {} : { LD_LIBRARY_PATH: args.sharedLibraryPath }),
      },
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) reject(error);
      else resolve(Buffer.concat(stdout));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${args.executable} timed out`));
    }, args.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > args.maxStdoutBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${args.executable} output exceeded the configured limit`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-8_000);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) finish(new Error(`${args.executable} exited ${String(code)}: ${stderr}`));
      else finish();
    });
  });
}

async function version(executable: string, timeoutMs: number, sharedLibraryPath?: string): Promise<string> {
  const bytes = await runProcess({ executable, argv: ["-version"], timeoutMs, maxStdoutBytes: 64 * 1024,
    ...(sharedLibraryPath === undefined ? {} : { sharedLibraryPath }) });
  const line = Buffer.from(bytes).toString("utf8").split(/\r?\n/u, 1)[0]?.trim();
  assert(line !== undefined && line.length > 0, `${executable} returned no version`);
  return line;
}

async function sourceBytes(env: MediaExecutionEnvironment, source: BlobRef): Promise<Uint8Array> {
  const bytes = await env.artifacts.get(source);
  assert(bytes !== undefined, `Media source ${source.digest} is unavailable`);
  assert(bytes.byteLength === source.size, `Media source ${source.digest} size differs`);
  return bytes;
}

async function stageArtifact(
  env: MediaExecutionEnvironment,
  source: BlobRef,
  path: string,
): Promise<void> {
  const chunks = await env.artifacts.open(source);
  assert(chunks !== undefined, `Media source ${source.digest} is unavailable`);
  const file = await open(path, "w");
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of chunks) {
      await file.write(chunk);
      hash.update(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await file.close();
  }
  assert(size === source.size, `Media source ${source.digest} size differs`);
  assert(`sha256:${hash.digest("hex")}` === source.digest, `Media source ${source.digest} digest differs`);
}

function timestampFraction(value: MediaTimestamp): { numerator: bigint; denominator: bigint } {
  return {
    numerator: BigInt(value.ticks) * BigInt(value.timeBase.numerator),
    denominator: BigInt(value.timeBase.denominator),
  };
}

function compareTimestamp(left: MediaTimestamp, right: MediaTimestamp): number {
  const a = timestampFraction(left);
  const b = timestampFraction(right);
  const x = a.numerator * b.denominator;
  const y = b.numerator * a.denominator;
  return x < y ? -1 : x > y ? 1 : 0;
}

function roundPositive(numerator: bigint, denominator: bigint): number {
  assert(numerator >= 0n && denominator > 0n, "Media duration is invalid");
  const value = (numerator * 2n + denominator) / (denominator * 2n);
  assert(value <= BigInt(Number.MAX_SAFE_INTEGER), "Media duration exceeds safe arithmetic");
  return Number(value);
}

function ceilPositive(numerator: bigint, denominator: bigint): number {
  assert(numerator >= 0n && denominator > 0n, "Media duration is invalid");
  const value = (numerator + denominator - 1n) / denominator;
  assert(value <= BigInt(Number.MAX_SAFE_INTEGER), "Media duration exceeds safe arithmetic");
  return Number(value);
}

function duration(value: { startPts?: MediaTimestamp; endPts?: MediaTimestamp }): { numerator: bigint; denominator: bigint } {
  assert(value.startPts !== undefined && value.endPts !== undefined, "Selected media stream has no presentation interval");
  const start = timestampFraction(value.startPts);
  const end = timestampFraction(value.endPts);
  const numerator = end.numerator * start.denominator - start.numerator * end.denominator;
  const denominator = end.denominator * start.denominator;
  assert(numerator > 0n, "Selected media stream has an empty presentation interval");
  return { numerator, denominator };
}

function signedOffset(origin: MediaTimestamp, value: MediaTimestamp, rate: number): number {
  const a = timestampFraction(origin);
  const b = timestampFraction(value);
  const numerator = (b.numerator * a.denominator - a.numerator * b.denominator) * BigInt(rate);
  const denominator = b.denominator * a.denominator;
  const magnitude = roundPositive(numerator < 0n ? -numerator : numerator, denominator);
  return numerator < 0n ? -magnitude : magnitude;
}

function stream<T extends MediaStream["kind"]>(
  inspection: MediaInspection,
  index: number | undefined,
  kind: T,
): Extract<MediaStream, { readonly kind: T }> | undefined {
  if (index === undefined) return undefined;
  const result = inspection.streams.find((item) => item.index === index);
  assert(result?.kind === kind, `Selected ${kind} stream ${index} is absent`);
  assert(result.timingStatus === "admissible", `Selected ${kind} stream ${index} timing is ${result.timingStatus}`);
  return result as Extract<MediaStream, { readonly kind: T }>;
}

type NormalizationPlan = {
  readonly video?: MediaVideoStream;
  readonly audio?: MediaAudioStream;
  readonly frameCount: number;
  readonly sampleFrames: number;
  readonly audioTrimStartSamples: number;
  readonly audioTrimEndSamples: number;
  readonly audioHeadSamples: number;
  readonly audioContentSamples: number;
  readonly audioTailSamples: number;
};

function normalizationPlan(
  inspection: MediaInspection,
  selection: MediaStreamSelection,
  frameRate: MediaRational,
): NormalizationPlan {
  assert(Number.isSafeInteger(frameRate.numerator) && frameRate.numerator > 0
    && Number.isSafeInteger(frameRate.denominator) && frameRate.denominator > 0,
  "Target frame rate is invalid");
  const video = stream(inspection, selection.videoStreamIndex, "video");
  const audio = stream(inspection, selection.audioStreamIndex, "audio");
  if (video !== undefined && selection.spanAuthority !== "video") {
    throw new Error("A synchronized visual currently requires video span authority; use audio authority only for audio-only media");
  }
  const authority = selection.spanAuthority === "video" ? video : audio;
  assert(authority?.startPts !== undefined && authority.endPts !== undefined, "Span authority stream is absent");
  const span = duration(authority);
  const scaledNumerator = span.numerator * BigInt(frameRate.numerator);
  const scaledDenominator = span.denominator * BigInt(frameRate.denominator);
  const frameCount = selection.spanAuthority === "video"
    ? roundPositive(scaledNumerator, scaledDenominator)
    : ceilPositive(scaledNumerator, scaledDenominator);
  assert(frameCount > 0, "Normalized media would contain no frame interval");
  const sampleFrames = roundPositive(
    BigInt(frameCount) * 48_000n * BigInt(frameRate.denominator),
    BigInt(frameRate.numerator),
  );
  if (audio === undefined) {
    return {
      ...(video === undefined ? {} : { video }),
      frameCount,
      sampleFrames,
      audioTrimStartSamples: 0,
      audioTrimEndSamples: 0,
      audioHeadSamples: 0,
      audioContentSamples: 0,
      audioTailSamples: 0,
    };
  }
  assert(audio.startPts !== undefined && audio.endPts !== undefined, "Selected audio has no presentation interval");
  const audioStart = signedOffset(authority.startPts, audio.startPts, 48_000);
  const audioEnd = signedOffset(authority.startPts, audio.endPts, 48_000);
  const contentStart = Math.max(0, audioStart);
  const contentEnd = Math.min(sampleFrames, audioEnd);
  assert(audioEnd > audioStart && contentEnd > contentStart, "Selected audio is outside the authoritative media span");
  return {
    ...(video === undefined ? {} : { video }),
    audio,
    frameCount,
    sampleFrames,
    audioTrimStartSamples: Math.max(0, -audioStart),
    audioTrimEndSamples: Math.max(0, audioEnd - sampleFrames),
    audioHeadSamples: contentStart,
    audioContentSamples: contentEnd - contentStart,
    audioTailSamples: sampleFrames - contentEnd,
  };
}

async function inspectFile(args: {
  readonly source: BlobRef;
  readonly input: string;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxProbeOutputBytes: number;
  readonly sharedLibraryPath?: string;
}): Promise<MediaInspection> {
  const [raw, ffprobeVersion] = await Promise.all([
    runProcess({
      executable: args.ffprobePath,
      argv: ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-show_frames", args.input],
      timeoutMs: args.timeoutMs,
      maxStdoutBytes: args.maxProbeOutputBytes,
      ...(args.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: args.sharedLibraryPath }),
    }),
    version(args.ffprobePath, args.timeoutMs, args.sharedLibraryPath),
  ]);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    throw new Error("ffprobe returned invalid JSON");
  }
  return parseMediaInspection({ source: args.source, ffprobeVersion, value });
}

function divisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function animatedWebpInspection(source: BlobRef, animation: AnimatedWebp): MediaInspection {
  const durationMs = animation.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const numerator = animation.frames.length * 1_000;
  const factor = divisor(numerator, durationMs);
  return sealMediaInspection({
    container: { formatNames: ["webp", "webp-animation"] },
    streams: [{
      kind: "video",
      index: 0,
      codecType: "video",
      codecName: "webp",
      disposition: { default: true, attachedPicture: false },
      timingStatus: "admissible",
      timeBase: { numerator: 1, denominator: 1_000 },
      startPts: { ticks: "0", timeBase: { numerator: 1, denominator: 1_000 } },
      endPts: { ticks: String(durationMs), timeBase: { numerator: 1, denominator: 1_000 } },
      decodedUnitCount: animation.frames.length,
      role: "moving",
      width: animation.width,
      height: animation.height,
      sampleAspectRatio: { numerator: 1, denominator: 1 },
      rotationDegrees: 0,
      averageFrameRate: { numerator: numerator / factor, denominator: durationMs / factor },
    }],
  });
}

async function animatedWebpConcat(
  env: MediaExecutionEnvironment,
  animation: AnimatedWebp,
  work: string,
): Promise<string> {
  assert(animation.frames.length <= 10_000, "Animated WebP has too many frames");
  const canvasBytes = animation.width * animation.height * 4;
  assert(Number.isSafeInteger(canvasBytes) && canvasBytes > 0 && canvasBytes <= 512 * 1024 * 1024,
    "Animated WebP canvas is outside the supported memory bound");
  const canvas = createAnimatedWebpCanvas(animation);
  const paths: string[] = [];
  for (const [index, frame] of animation.frames.entries()) {
    const imagePath = join(work, `webp-source-${String(index).padStart(6, "0")}.webp`);
    await writeFile(imagePath, frame.image);
    const decoded = await runProcess({
      executable: env.ffmpegPath,
      argv: ["-v", "error", "-i", imagePath, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: frame.width * frame.height * 4,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const snapshot = compositeAnimatedWebpFrame(canvas, animation, frame, decoded);
    const path = join(work, `webp-frame-${String(index).padStart(6, "0")}.pam`);
    await writeFile(path, pamRgba(animation.width, animation.height, snapshot));
    paths.push(path);
  }
  const lines = ["ffconcat version 1.0"];
  for (const [index, path] of paths.entries()) {
    lines.push(`file '${path}'`, `duration ${(animation.frames[index]!.durationMs / 1_000).toFixed(6)}`);
  }
  lines.push(`file '${paths.at(-1)!}'`);
  const manifest = join(work, "animated-webp.ffconcat");
  await writeFile(manifest, `${lines.join("\n")}\n`, "utf8");
  return manifest;
}

async function outputInspection(args: {
  readonly path: string;
  readonly mediaType: string;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxProbeOutputBytes: number;
  readonly sharedLibraryPath?: string;
}): Promise<MediaInspection> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(args.path)) {
    hash.update(chunk);
    size += chunk.byteLength;
  }
  const source: BlobRef = {
    kind: "blob",
    digest: `sha256:${hash.digest("hex")}` as BlobRef["digest"],
    size,
    mediaType: args.mediaType,
  };
  return await inspectFile({ source, input: args.path, ffprobePath: args.ffprobePath,
    timeoutMs: args.timeoutMs, maxProbeOutputBytes: args.maxProbeOutputBytes,
    ...(args.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: args.sharedLibraryPath }) });
}

function inlineResult(value: CanonicalValue): MediaOperationResult {
  return { value: { kind: "inline", value } };
}

function artifactResult(value: BlobRef): MediaOperationResult {
  return { value };
}

function inspectNeed(value: CanonicalValue): InspectMediaNeed {
  const item = object(value, "InspectMediaNeed") as unknown as InspectMediaNeed;
  assert(item.source?.kind === "blob", "InspectMediaNeed is invalid");
  return item;
}

function normalizeNeed(value: CanonicalValue): NormalizeMediaNeed {
  const item = object(value, "NormalizeMediaNeed") as unknown as NormalizeMediaNeed;
  assert(item.source?.kind === "blob", "NormalizeMediaNeed is invalid");
  verifyMediaInspection(item.inspection);
  verifyMediaStreamSelection(item.selection);
  assert(item.audio.sampleRate === 48_000 && item.audio.channels === 2
    && item.audio.codec === "pcm_s16le" && item.audio.loudness === "preserve",
  "NormalizeMediaNeed audio profile is unsupported");
  return item;
}

function transformNeed(value: CanonicalValue): TransformMediaNeed {
  const item = object(value, "TransformMediaNeed") as unknown as TransformMediaNeed;
  verifySynchronizedMedia(item.media);
  verifyMediaTransformProgram(item.program);
  assert(item.media.visual !== undefined, "TransformMediaNeed requires synchronized visual media");
  return item;
}

function extractAudioNeed(value: CanonicalValue): ExtractAudioNeed {
  const item = object(value, "ExtractAudioNeed") as unknown as ExtractAudioNeed;
  assert(item.source?.kind === "blob", "ExtractAudioNeed is invalid");
  assert(Number.isSafeInteger(item.streamIndex) && item.streamIndex >= 0,
    "ExtractAudioNeed streamIndex is invalid");
  verifyAudioExtractionRequest({
    audio: { mode: "stream-index", streamIndex: item.streamIndex },
    output: item.output,
  });
  return item;
}

function extractFrameNeed(value: CanonicalValue): ExtractFrameNeed {
  const item = object(value, "ExtractFrameNeed") as unknown as ExtractFrameNeed;
  assert(item.source?.kind === "blob", "ExtractFrameNeed is invalid");
  assert(Number.isSafeInteger(item.streamIndex) && item.streamIndex >= 0
    && Number.isSafeInteger(item.sourceFrameCount) && item.sourceFrameCount > 0,
  "ExtractFrameNeed stream domain is invalid");
  verifyFrameExtractionRequest({
    video: { mode: "stream-index", streamIndex: item.streamIndex },
    at: item.at,
    output: item.output,
  });
  if (item.at.kind === "frame") {
    assert(item.at.index < item.sourceFrameCount, "ExtractFrameNeed frame lies outside the source stream");
  }
  return item;
}

function evidenceAudioNeed(value: CanonicalValue): ProjectSpeechEvidenceAudioNeed {
  const item = object(value, "ProjectSpeechEvidenceAudioNeed") as unknown as ProjectSpeechEvidenceAudioNeed;
  assert(item.source?.kind === "blob", "ProjectSpeechEvidenceAudioNeed is invalid");
  assert(Number.isSafeInteger(item.sourceSampleFrames) && item.sourceSampleFrames > 0
    && Number.isSafeInteger(item.evidenceSampleFrames) && item.evidenceSampleFrames > 0
    && item.evidenceSampleFrames === speechEvidenceSampleBoundary(item.sourceSampleFrames),
  "Speech evidence audio sample projection is invalid");
  return item;
}

function renderAudioNeed(value: CanonicalValue): RenderAudioNeed {
  const item = object(value, "RenderAudioNeed") as unknown as RenderAudioNeed;
  verifyAudioProgramPlan(item.plan);
  return item;
}

function muxMediaNeed(value: CanonicalValue): MuxMediaNeed {
  const item = object(value, "MuxMediaNeed") as unknown as MuxMediaNeed;
  verifyRenderedVisual(item.visual);
  verifyTimelineAudio(item.audio);
  const expectedSamples = roundPositive(
    BigInt(item.visual.frameCount) * 48_000n * BigInt(item.visual.frameRate.denominator),
    BigInt(item.visual.frameRate.numerator),
  );
  assert(item.audio.sampleFrames === expectedSamples, "MuxMediaNeed audio differs from the visual frame domain");
  return item;
}

function atempo(rate: number): string[] {
  if (Math.abs(rate - 1) < 1e-12) return [];
  const filters: string[] = [];
  let remaining = rate;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) >= 1e-12) filters.push(`atempo=${remaining.toPrecision(15)}`);
  return filters;
}

function audioClipFilter(clip: AudioProgramClip, inputIndex: number, outputIndex: number): string {
  const length = clip.targetEndSampleExclusive - clip.targetStartSample;
  const sourceLength = clip.sourceEndSampleExclusive - clip.sourceStartSample;
  const filters = [
    `atrim=start_sample=${clip.sourceStartSample}:end_sample=${clip.sourceEndSampleExclusive}`,
    "asetpts=PTS-STARTPTS",
    ...(clip.sourceLoop ? [`aloop=loop=-1:size=${sourceLength}:start=0`] : []),
    ...(clip.sourcePhaseSample === 0 ? [] : [
      `atrim=start_sample=${clip.sourcePhaseSample}`,
      "asetpts=PTS-STARTPTS",
    ]),
    ...atempo(clip.playbackRate),
    `atrim=start_sample=0:end_sample=${length}`,
    `apad=whole_len=${length}`,
    `atrim=start_sample=0:end_sample=${length}`,
    `volume=${clip.gain.toPrecision(15)}`,
    ...(clip.fadeInSamples === 0 ? [] : [`afade=t=in:start_sample=0:nb_samples=${clip.fadeInSamples}`]),
    ...(clip.fadeOutSamples === 0 ? [] : [
      `afade=t=out:start_sample=${length - clip.fadeOutSamples}:nb_samples=${clip.fadeOutSamples}`,
    ]),
    `adelay=${clip.targetStartSample}S:all=1`,
  ];
  return `[${inputIndex}:a:0]${filters.join(",")}[clip${outputIndex}]`;
}

async function assertCanonicalWav(args: {
  readonly path: string;
  readonly source: BlobRef;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxProbeOutputBytes: number;
  readonly sharedLibraryPath?: string;
}): Promise<MediaAudioStream> {
  const inspection = await inspectFile({
    source: args.source,
    input: args.path,
    ffprobePath: args.ffprobePath,
    timeoutMs: args.timeoutMs,
    maxProbeOutputBytes: args.maxProbeOutputBytes,
    ...(args.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: args.sharedLibraryPath }),
  });
  const audio = inspection.streams.filter((item): item is MediaAudioStream => item.kind === "audio");
  assert(audio.length === 1 && inspection.streams.length === 1, "Canonical audio must contain exactly one stream");
  assert(audio[0]!.codecName === "pcm_s16le" && audio[0]!.sampleRate === 48_000 && audio[0]!.channels === 2,
    "Canonical audio must be 48 kHz stereo PCM s16");
  assert(audio[0]!.timingStatus === "admissible", "Canonical audio timing is not admissible");
  return audio[0]!;
}

export async function executeInspectMedia(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = inspectNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "narratage-media-inspect-"));
  try {
    const input = join(work, "source.bin");
    const animationBytes = need.source.mediaType === "image/webp" ? await sourceBytes(env, need.source) : undefined;
    if (animationBytes === undefined) await stageArtifact(env, need.source, input);
    else await writeFile(input, animationBytes);
    const animation = animationBytes === undefined ? undefined : parseAnimatedWebp(animationBytes);
    const inspection = animation === undefined
      ? await inspectFile({
        source: need.source,
        input,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      })
      : animatedWebpInspection(need.source, animation);
    return inlineResult(canonicalize(inspection));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeNormalizeMedia(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = normalizeNeed(constraints);
  const plan = normalizationPlan(need.inspection, need.selection, need.frameRate);
  const work = await mkdtemp(join(tmpdir(), "narratage-media-normalize-"));
  try {
    const input = join(work, "source.bin");
    const animationBytes = need.source.mediaType === "image/webp" ? await sourceBytes(env, need.source) : undefined;
    if (animationBytes === undefined) await stageArtifact(env, need.source, input);
    else await writeFile(input, animationBytes);
    const animation = animationBytes === undefined ? undefined : parseAnimatedWebp(animationBytes);
    let visualArtifact: BlobRef | undefined;
    let visualWidth: number | undefined;
    let visualHeight: number | undefined;
    if (plan.video !== undefined) {
      const output = join(work, "visual.mp4");
      const fps = `${need.frameRate.numerator}/${need.frameRate.denominator}`;
      const filter = [
        "setpts=PTS-STARTPTS",
        `fps=fps=${fps}:round=near:start_time=0:eof_action=round`,
        `trim=start_frame=0:end_frame=${plan.frameCount}`,
        `setpts=N*${need.frameRate.denominator}/(${need.frameRate.numerator}*TB)`,
        // Autorotation runs before this filter. Expand, never shrink, the axis
        // carrying non-square samples, then erase SAR so downstream Spatial
        // receives only truthful square-pixel display dimensions.
        "scale=trunc(iw*max(sar\\,1)/2)*2:trunc(ih*max(1/sar\\,1)/2)*2",
        "setsar=1",
      ].join(",");
      const visualInput = animation === undefined
        ? ["-autorotate", "-i", input, "-map", `0:${plan.video.index}`]
        : ["-f", "concat", "-safe", "0", "-i", await animatedWebpConcat(env, animation, work), "-map", "0:v:0"];
      await runProcess({
        executable: env.ffmpegPath,
        argv: ["-y", ...visualInput, "-an", "-vf", filter,
          "-frames:v", String(plan.frameCount), "-fps_mode", "cfr", "-c:v", "libx264",
          "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
        timeoutMs: env.processTimeoutMs,
        maxStdoutBytes: 64 * 1024,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      });
      const inspected = await outputInspection({
        path: output,
        mediaType: "video/mp4",
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      });
      const visual = inspected.streams.find((item): item is MediaVideoStream => item.kind === "video");
      assert(visual?.decodedUnitCount === plan.frameCount && visual.role === "moving",
        "Normalized visual frame shape differs from its plan");
      assert(visual.sampleAspectRatio.numerator === 1 && visual.sampleAspectRatio.denominator === 1
        && visual.rotationDegrees === 0,
      "Normalized visual retains non-square samples or display rotation");
      visualArtifact = await env.artifacts.putFile(output, "video/mp4");
      visualWidth = visual.width;
      visualHeight = visual.height;
    }
    let audioArtifact: BlobRef | undefined;
    if (plan.audio !== undefined) {
      const output = join(work, "audio.wav");
      const filter = [
        "asetpts=PTS-STARTPTS",
        "aresample=48000:async=0:first_pts=0",
        "aformat=sample_rates=48000:channel_layouts=stereo",
        `atrim=start_sample=${plan.audioTrimStartSamples}:end_sample=${plan.audioTrimStartSamples + plan.audioContentSamples}`,
        "asetpts=N/SR/TB",
        `adelay=${plan.audioHeadSamples}S:all=1`,
        `apad=whole_len=${plan.sampleFrames}`,
        `atrim=start_sample=0:end_sample=${plan.sampleFrames}`,
        "asetpts=N/SR/TB",
      ].join(",");
      await runProcess({
        executable: env.ffmpegPath,
        argv: ["-y", "-i", input, "-map", `0:${plan.audio.index}`, "-vn", "-af", filter,
          "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", output],
        timeoutMs: env.processTimeoutMs,
        maxStdoutBytes: 64 * 1024,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      });
      const inspected = await outputInspection({
        path: output,
        mediaType: "audio/wav",
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      });
      const audio = inspected.streams.find((item): item is MediaAudioStream => item.kind === "audio");
      assert(audio?.decodedSampleFrames === plan.sampleFrames && audio.sampleRate === 48_000 && audio.channels === 2,
        "Normalized audio sample shape differs from its plan");
      audioArtifact = await env.artifacts.putFile(output, "audio/wav");
    }
    const media = sealSynchronizedMedia({
      timeline: {
        frameRate: need.frameRate,
        frameCount: plan.frameCount,
      },
      ...(visualArtifact === undefined ? {} : {
        visual: {
          artifact: visualArtifact,
          width: visualWidth!,
          height: visualHeight!,
        },
      }),
      ...(audioArtifact === undefined ? {} : {
        audio: {
          artifact: audioArtifact,
        },
      }),
    });
    return inlineResult(canonicalize(media));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

type TransformPlan = {
  readonly videoFilters: readonly string[];
  readonly audioFilters: readonly string[];
  readonly frameCount: number;
  readonly sampleFrames: number;
  readonly durationSec: number;
};

function decimal(value: number): string {
  assert(Number.isFinite(value), "Media transform produced a non-finite time");
  return value.toPrecision(15);
}

function compileTransformPlan(media: SynchronizedMedia, operations: readonly MediaTransformOperation[]): TransformPlan {
  const rate = media.timeline.frameRate.numerator / media.timeline.frameRate.denominator;
  let durationSec = media.timeline.frameCount / rate;
  const videoFilters: string[] = ["setpts=PTS-STARTPTS"];
  const audioFilters: string[] = ["asetpts=N/SR/TB"];
  for (const [index, operation] of operations.entries()) {
    if (operation.kind === "trim") {
      const start = operation.startSec ?? 0;
      const end = operation.endSec ?? (operation.tailSec === undefined
        ? durationSec
        : durationSec - operation.tailSec);
      assert(start >= 0 && start < durationSec,
        `Media transform trim ${index} starts outside its current ${durationSec}s timeline`);
      assert(end > start && end <= durationSec + 1e-9,
        `Media transform trim ${index} ends outside its current ${durationSec}s timeline`);
      const boundedEnd = Math.min(end, durationSec);
      videoFilters.push(`trim=start=${decimal(start)}:end=${decimal(boundedEnd)}`, "setpts=PTS-STARTPTS");
      audioFilters.push(`atrim=start=${decimal(start)}:end=${decimal(boundedEnd)}`, "asetpts=N/SR/TB");
      durationSec = boundedEnd - start;
      continue;
    }
    videoFilters.push(`setpts=PTS/${decimal(operation.rate)}`);
    audioFilters.push(...atempo(operation.rate));
    durationSec /= operation.rate;
  }
  const frameCount = Math.max(1, Math.round(durationSec * rate));
  assert(Number.isSafeInteger(frameCount), "Media transform output frame count exceeds safe arithmetic");
  const sampleFrames = roundPositive(
    BigInt(frameCount) * 48_000n * BigInt(media.timeline.frameRate.denominator),
    BigInt(media.timeline.frameRate.numerator),
  );
  const fps = `${media.timeline.frameRate.numerator}/${media.timeline.frameRate.denominator}`;
  videoFilters.push(
    `fps=fps=${fps}:round=near:start_time=0:eof_action=round`,
    `trim=start_frame=0:end_frame=${frameCount}`,
    `setpts=N*${media.timeline.frameRate.denominator}/(${media.timeline.frameRate.numerator}*TB)`,
  );
  audioFilters.push(
    `apad=whole_len=${sampleFrames}`,
    `atrim=start_sample=0:end_sample=${sampleFrames}`,
    "asetpts=N/SR/TB",
  );
  return { videoFilters, audioFilters, frameCount, sampleFrames, durationSec };
}

/** Ordered trim/retime over one exact synchronized A/V value. */
export async function executeTransformMedia(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = transformNeed(constraints);
  const media = need.media;
  const plan = compileTransformPlan(media, need.program.operations);
  const work = await mkdtemp(join(tmpdir(), "narratage-media-transform-"));
  try {
    const visualPath = join(work, "visual.mp4");
    const audioPath = join(work, "audio.wav");
    const output = join(work, "transformed.mp4");
    await stageArtifact(env, media.visual!.artifact, visualPath);
    if (media.audio !== undefined) await stageArtifact(env, media.audio.artifact, audioPath);
    const argv = ["-y", "-i", visualPath];
    if (media.audio !== undefined) {
      argv.push(
        "-i", audioPath,
        "-filter_complex",
        `[0:v:0]${plan.videoFilters.join(",")}[video];[1:a:0]${plan.audioFilters.join(",")}[audio]`,
        "-map", "[video]", "-map", "[audio]",
        "-c:a", "aac", "-ar", "48000", "-ac", "2",
      );
    } else {
      argv.push("-map", "0:v:0", "-an", "-vf", plan.videoFilters.join(","));
    }
    argv.push(
      "-frames:v", String(plan.frameCount), "-fps_mode", "cfr",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", output,
    );
    await runProcess({
      executable: env.ffmpegPath,
      argv,
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const inspected = await outputInspection({
      path: output,
      mediaType: "video/mp4",
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const videos = inspected.streams.filter((item): item is MediaVideoStream => item.kind === "video");
    const audios = inspected.streams.filter((item): item is MediaAudioStream => item.kind === "audio");
    assert(videos.length === 1 && videos[0]!.role === "moving"
      && videos[0]!.decodedUnitCount === plan.frameCount,
    "Transformed media video differs from its compiled frame domain");
    assert(audios.length === (media.audio === undefined ? 0 : 1),
      "Transformed media audio presence differs from its synchronized input");
    if (audios[0] !== undefined) {
      assert(audios[0].sampleRate === 48_000 && audios[0].channels === 2,
        "Transformed media audio is not 48 kHz stereo");
    }
    const artifact = await env.artifacts.putFile(output, "video/mp4");
    return artifactResult(artifact);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Generic model-reference audio: no Narrative, SpeechBasis or alignment claim is introduced. */
export async function executeExtractAudio(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = extractAudioNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "narratage-media-extract-audio-"));
  try {
    const input = join(work, "source.bin");
    const output = join(work, "audio.wav");
    await stageArtifact(env, need.source, input);
    await runProcess({
      executable: env.ffmpegPath,
      argv: [
        "-y", "-i", input, "-map", `0:${need.streamIndex}`, "-vn",
        "-af", "asetpts=PTS-STARTPTS,aresample=48000:async=0:first_pts=0,aformat=sample_rates=48000:channel_layouts=stereo",
        "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", output,
      ],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const artifact = await env.artifacts.putFile(output, "audio/wav");
    await assertCanonicalWav({
      path: output,
      source: artifact,
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    return artifactResult(artifact);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeExtractFrame(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = extractFrameNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "narratage-media-extract-frame-"));
  try {
    const input = join(work, "source.bin");
    const output = join(work, "frame.png");
    await stageArtifact(env, need.source, input);
    const selection = need.at.kind === "first"
      ? "eq(n\\,0)"
      : need.at.kind === "last"
        ? `eq(n\\,${need.sourceFrameCount - 1})`
        : need.at.kind === "frame"
          ? `eq(n\\,${need.at.index})`
          : `gte(t\\,${decimal(need.at.seconds)})`;
    await runProcess({
      executable: env.ffmpegPath,
      argv: [
        "-y", "-i", input, "-map", `0:${need.streamIndex}`, "-an",
        "-vf", `setpts=PTS-STARTPTS,select=${selection}`,
        "-frames:v", "1", "-fps_mode", "vfr", "-c:v", "png", output,
      ],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const bytes = await readFile(output);
    assert(bytes.byteLength > 0, "Frame extraction produced no image");
    const inspected = await outputInspection({
      path: output,
      mediaType: "image/png",
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const images = inspected.streams.filter((item): item is MediaVideoStream => item.kind === "video");
    assert(images.length === 1 && images[0]!.decodedUnitCount === 1,
      "Frame extraction output must decode to exactly one image");
    const artifact = await env.artifacts.put(bytes, "image/png");
    return artifactResult(artifact);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeProjectSpeechEvidenceAudio(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = evidenceAudioNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "narratage-media-speech-evidence-"));
  try {
    const input = join(work, "speech-master.wav");
    const output = join(work, "alignment-evidence.wav");
    await stageArtifact(env, need.source, input);
    const source = await assertCanonicalWav({
      path: input,
      source: need.source,
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    assert(source.decodedSampleFrames === need.sourceSampleFrames,
      "Speech master sample count differs from its ProgramSpace");
    const filter = [
      "asetpts=N/SR/TB",
      "aresample=16000:async=0:first_pts=0",
      "aformat=sample_rates=16000:channel_layouts=mono",
      `apad=whole_len=${need.evidenceSampleFrames}`,
      `atrim=start_sample=0:end_sample=${need.evidenceSampleFrames}`,
      "asetpts=N/SR/TB",
    ].join(",");
    await runProcess({
      executable: env.ffmpegPath,
      argv: ["-y", "-i", input, "-vn", "-af", filter,
        "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1", output],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const inspected = await outputInspection({
      path: output,
      mediaType: "audio/wav",
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const streams = inspected.streams.filter((item): item is MediaAudioStream => item.kind === "audio");
    assert(streams.length === 1 && inspected.streams.length === 1
      && streams[0]!.codecName === "pcm_s16le"
      && streams[0]!.sampleRate === 16_000
      && streams[0]!.channels === 1
      && streams[0]!.decodedSampleFrames === need.evidenceSampleFrames,
    "Alignment evidence must be exact 16 kHz mono PCM s16");
    const artifact = await env.artifacts.putFile(output, "audio/wav");
    const evidence: SpeechEvidenceAudio = sealSpeechEvidenceAudio({
      artifact,
      sampleFrames: need.evidenceSampleFrames,
    });
    assertSpeechEvidenceAudioIdentity(evidence);
    return inlineResult(canonicalize(evidence));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeRenderTimelineAudio(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = renderAudioNeed(constraints);
  const plan: AudioProgramPlan = need.plan;
  const work = await mkdtemp(join(tmpdir(), "narratage-media-audio-"));
  try {
    const artifacts = new Map<string, { source: BlobRef; path: string; inputIndex: number; sampleFrames: number }>();
    for (const clip of plan.clips) {
      const existing = artifacts.get(clip.artifact.digest);
      if (existing !== undefined) {
        assert(existing.sampleFrames === clip.sourceSampleFrames,
          `Audio input ${clip.artifact.digest} has conflicting sample counts in one plan`);
        continue;
      }
      const inputIndex = artifacts.size;
      const path = join(work, `input-${inputIndex}.wav`);
      await stageArtifact(env, clip.artifact, path);
      const audio = await assertCanonicalWav({
        path,
        source: clip.artifact,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      });
      assert(audio.decodedSampleFrames === clip.sourceSampleFrames,
        `Audio input ${clip.artifact.digest} sample count differs from its plan`);
      artifacts.set(clip.artifact.digest, {
        source: clip.artifact,
        path,
        inputIndex,
        sampleFrames: audio.decodedSampleFrames,
      });
    }

    const output = join(work, "program.wav");
    const argv = ["-y"];
    for (const item of artifacts.values()) argv.push("-i", item.path);
    if (plan.clips.length === 0) {
      argv.push(
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-af", `atrim=start_sample=0:end_sample=${plan.sampleFrames},asetpts=N/SR/TB`,
      );
    } else {
      const chains = plan.clips.map((clip, index) => {
        const inputIndex = artifacts.get(clip.artifact.digest)!.inputIndex;
        return audioClipFilter(clip, inputIndex, index);
      });
      const labels = plan.clips.map((_clip, index) => `[clip${index}]`).join("");
      chains.push(
        `${labels}amix=inputs=${plan.clips.length}:duration=longest:dropout_transition=0:normalize=0,`
        + `apad=whole_len=${plan.sampleFrames},atrim=start_sample=0:end_sample=${plan.sampleFrames},`
        + "asetpts=N/SR/TB[out]",
      );
      argv.push("-filter_complex", chains.join(";"), "-map", "[out]");
    }
    argv.push("-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", output);
    await runProcess({
      executable: env.ffmpegPath,
      argv,
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const artifact = await env.artifacts.putFile(output, "audio/wav");
    const audio = await assertCanonicalWav({
      path: output,
      source: artifact,
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    assert(audio.decodedSampleFrames === plan.sampleFrames,
      "Rendered TimelineAudio sample count differs from its plan");
    const value: TimelineAudio = sealTimelineAudio({
      artifact,
      sampleFrames: plan.sampleFrames,
    });
    return inlineResult(canonicalize(value));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeMuxProgramMedia(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = muxMediaNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "narratage-media-mux-"));
  try {
    const visualPath = join(work, "visual.mp4");
    const audioPath = join(work, "audio.wav");
    const output = join(work, "final.mp4");
    await Promise.all([
      stageArtifact(env, need.visual.artifact, visualPath),
      stageArtifact(env, need.audio.artifact, audioPath),
    ]);
    const [visualInspection, audio] = await Promise.all([
      inspectFile({
        source: need.visual.artifact,
        input: visualPath,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      }),
      assertCanonicalWav({
        path: audioPath,
        source: need.audio.artifact,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      }),
    ]);
    const visualStreams = visualInspection.streams.filter((item): item is MediaVideoStream => item.kind === "video");
    assert(visualStreams.length === 1 && visualInspection.streams.length === 1,
      "RenderedVisual Artifact must contain exactly one silent video stream");
    const visual = visualStreams[0]!;
    assert(visual.role === "moving" && visual.timingStatus === "admissible"
      && visual.decodedUnitCount === need.visual.frameCount
      && visual.width === need.visual.canvas.width && visual.height === need.visual.canvas.height,
    "RenderedVisual bytes differ from their declared frame domain");
    assert(audio.decodedSampleFrames === need.audio.sampleFrames,
      "TimelineAudio bytes differ from their declared sample domain");
    await runProcess({
      executable: env.ffmpegPath,
      argv: [
        "-y", "-i", visualPath, "-i", audioPath,
        "-map", `0:${visual.index}`, "-map", "1:0",
        "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2",
        "-frames:v", String(need.visual.frameCount),
        "-movflags", "+faststart", output,
      ],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const finalInspection = await outputInspection({
      path: output,
      mediaType: "video/mp4",
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const finalVideo = finalInspection.streams.filter((item): item is MediaVideoStream => item.kind === "video");
    const finalAudio = finalInspection.streams.filter((item): item is MediaAudioStream => item.kind === "audio");
    assert(finalVideo.length === 1 && finalAudio.length === 1 && finalInspection.streams.length === 2,
      "Final mux must contain exactly one video and one audio stream");
    assert(finalVideo[0]!.timingStatus === "admissible"
      && finalVideo[0]!.decodedUnitCount === need.visual.frameCount,
      "Final mux video frame count differs from RenderedVisual");
    assert(finalAudio[0]!.timingStatus === "admissible"
      && finalAudio[0]!.sampleRate === 48_000 && finalAudio[0]!.channels === 2,
      "Final mux audio shape differs from TimelineAudio");
    assert(finalVideo[0]!.startPts !== undefined && finalAudio[0]!.startPts !== undefined
      && compareTimestamp(finalVideo[0]!.startPts, finalAudio[0]!.startPts) === 0,
    "Final mux audio and video do not share one presentation origin");
    const finalAudioSpan = duration(finalAudio[0]!);
    assert(roundPositive(finalAudioSpan.numerator * 48_000n, finalAudioSpan.denominator)
      === need.audio.sampleFrames,
    "Final mux audio presentation span differs from TimelineAudio");
    const artifact = await env.artifacts.putFile(output, "video/mp4");
    const value: MuxedMedia = sealMuxedMedia({
      frameRate: need.visual.frameRate,
      frameCount: need.visual.frameCount,
      canvas: need.visual.canvas,
      presentationSampleFrames: need.audio.sampleFrames,
      artifact,
    });
    return inlineResult(canonicalize(value));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
