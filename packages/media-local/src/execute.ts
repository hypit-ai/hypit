import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sameVisualDeliverySpec, sealMediaInspection, sealMuxedMedia, sealTimelineAudio, verifyMediaDeliverySpec, verifyPreparedAudioSource, verifyTimelineVisual, verifyTimelineAudio } from "@hypit/media";
import type { MediaAudioStream, MediaInspection, MediaTimestamp, MediaVideoStream, MuxedMedia, PreparedAudioSource, TimelineAudio } from "@hypit/media";
import { assertFrameSpan, clockFrameSpanSamples } from "@hypit/timeline";
import { assertSpeechEvidenceAudioIdentity, sealSpeechEvidenceAudio, speechEvidenceSampleFrames } from "@hypit/speech-evidence";
import type { ProjectSpeechEvidenceAudioNeed, SpeechEvidenceAudio } from "@hypit/speech-evidence";
import {
  verifyAudioExtractionRequest,
  verifyFrameExtractionRequest,
  type ExtractAudioNeed,
  type ExtractFrameNeed,
  type InspectMediaNeed,
  type RenderStillVideoNeed,
  verifyStillVideoRequest,
} from "@hypit/media-operations";
import { verifyAudioProgram } from "@hypit/audio-program";
import type { AudioProgram, AudioProgramClip, RenderAudioNeed } from "@hypit/audio-program";
import { readPreservePitch } from "@hypit/audio-stretch";
import type { MuxMediaNeed } from "@hypit/media-delivery";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue, Value } from "@hypit/hypit/protocol";
import { addExactTemporalValues, assertTemporalMap, compareExactTemporalValues, isAffineTemporalMapPiece, resolveTemporalBoundary, scaleExactTemporalValue, subtractExactTemporalValues } from "@hypit/temporal";
import type { ExactTemporalValue, TemporalMapStage } from "@hypit/temporal";

import { runBoundedMediaProcess } from "./process.js";
import { parseMediaInspection } from "./probe.js";
import { parseAnimatedWebp } from "./webp.js";
import type { AnimatedWebp } from "./webp.js";
import { CanonicalPcmReader, planPositiveAffineReconstruction, renderAudioProgramWav } from "./audio-render.js";

/**
 * Where the bytes live and which binaries transform them.
 *
 * These byte operations are written once behind an Artifact gateway. The local Provider supplies
 * the Build's ResourceStore and the ffmpeg on its PATH. Another execution owner may reuse the same
 * algorithms with a different gateway and tool bundle; nothing here claims a Provider or deployment.
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

/**
 * A request-private Artifact gateway for decoder working files. Reads fall
 * through to authored resources; writes never enter the Build's repository.
 */
async function privateMediaExecutionEnvironment(
  env: MediaExecutionEnvironment,
  directory: string,
): Promise<MediaExecutionEnvironment> {
  await mkdir(directory, { recursive: true });
  const files = new Map<string, { readonly path: string; readonly ref: BlobRef }>();
  const allocate = async (mediaType: string, write: (path: string) => Promise<void>): Promise<BlobRef> => {
    const token = randomUUID().replaceAll("-", "");
    const path = join(directory, token);
    await write(path);
    const info = await stat(path);
    const ref = {
      kind: "blob" as const,
      resource: `res_private_${token}` as BlobRef["resource"],
      size: info.size,
      mediaType,
    };
    files.set(ref.resource, { path, ref });
    return ref;
  };
  return {
    ...env,
    artifacts: {
      get: async (source) => {
        const privateFile = files.get(source.resource);
        return privateFile === undefined ? env.artifacts.get(source) : readFile(privateFile.path);
      },
      open: async (source) => {
        const privateFile = files.get(source.resource);
        return privateFile === undefined ? env.artifacts.open(source) : createReadStream(privateFile.path);
      },
      put: async (bytes, mediaType) => allocate(mediaType, async path => { await writeFile(path, bytes); }),
      putFile: async (sourcePath, mediaType) => allocate(mediaType, async path => { await copyFile(sourcePath, path); }),
    },
  };
}

export type MediaOperationResult = {
  readonly value: Value;
};

/** Renderer-private PCM input. It is never a graph value or a PreparedMedia replacement. */
type AudioRenderSource = {
  readonly artifact: BlobRef;
  readonly sampleRate: 48_000;
  readonly sampleFrames: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function verifyAudioRenderSource(value: unknown): asserts value is AudioRenderSource {
  const item = object(value, "AudioRenderSource");
  assertBlobRef(item.artifact);
  assert(item.artifact.mediaType === "audio/wav", "Audio render source must be WAV");
  assert(item.sampleRate === 48_000, "Audio render source must use 48 kHz samples");
  positiveInteger(item.sampleFrames as number, "AudioRenderSource.sampleFrames");
}

function sealAudioRenderSource(value: AudioRenderSource): AudioRenderSource {
  verifyAudioRenderSource(value);
  return canonicalize(value) as unknown as AudioRenderSource;
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
  return await runBoundedMediaProcess(args);
}

async function sourceBytes(env: MediaExecutionEnvironment, source: BlobRef): Promise<Uint8Array> {
  const bytes = await env.artifacts.get(source);
  assert(bytes !== undefined, `Media source ${source.resource} is unavailable`);
  assert(bytes.byteLength === source.size, `Media source ${source.resource} size differs`);
  return bytes;
}

async function stageArtifact(
  env: MediaExecutionEnvironment,
  source: BlobRef,
  path: string,
): Promise<void> {
  const chunks = await env.artifacts.open(source);
  assert(chunks !== undefined, `Media source ${source.resource} is unavailable`);
  const file = await open(path, "w");
  let size = 0;
  try {
    for await (const chunk of chunks) {
      await file.write(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await file.close();
  }
  assert(size === source.size, `Media source ${source.resource} size differs`);
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

function duration(value: { startPts?: MediaTimestamp; endPts?: MediaTimestamp }): { numerator: bigint; denominator: bigint } {
  assert(value.startPts !== undefined && value.endPts !== undefined, "Selected media stream has no presentation interval");
  const start = timestampFraction(value.startPts);
  const end = timestampFraction(value.endPts);
  const numerator = end.numerator * start.denominator - start.numerator * end.denominator;
  const denominator = end.denominator * start.denominator;
  assert(numerator > 0n, "Selected media stream has an empty presentation interval");
  return { numerator, denominator };
}

type AudioRenderSourcePlan = {
  readonly streamIndex: number;
  readonly sampleRate: 48_000;
  readonly sampleFrames: number;
};

function audioRenderSourcePlan(need: AudioRenderSourceBaseNeed): AudioRenderSourcePlan {
  const span = {
    numerator: BigInt(need.sourceDuration.ticks) * BigInt(need.sourceDuration.timeBase.numerator),
    denominator: BigInt(need.sourceDuration.timeBase.denominator),
  };
  assert(span.numerator > 0n, "Prepared audio duration must be positive");
  const sampleRate = 48_000 as const;
  const sampleFrames = roundPositive(span.numerator * BigInt(sampleRate), span.denominator);
  return { streamIndex: need.streamIndex, sampleRate, sampleFrames };
}

async function inspectFile(args: {
  readonly input: string;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxProbeOutputBytes: number;
  readonly sharedLibraryPath?: string;
}): Promise<MediaInspection> {
  const raw = await runProcess({
    executable: args.ffprobePath,
    argv: ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-show_frames", "-show_pixel_formats", args.input],
    timeoutMs: args.timeoutMs,
    maxStdoutBytes: args.maxProbeOutputBytes,
    ...(args.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: args.sharedLibraryPath }),
  });
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    throw new Error("ffprobe returned invalid JSON");
  }
  return parseMediaInspection(value);
}

function divisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function animatedWebpInspection(animation: AnimatedWebp): MediaInspection {
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
      picture: {
        colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full",
        bitDepth: 8, alphaMode: "straight",
      },
    }],
  });
}

async function outputInspection(args: {
  readonly path: string;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxProbeOutputBytes: number;
  readonly sharedLibraryPath?: string;
}): Promise<MediaInspection> {
  return await inspectFile({ input: args.path, ffprobePath: args.ffprobePath,
    timeoutMs: args.timeoutMs, maxProbeOutputBytes: args.maxProbeOutputBytes,
    ...(args.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: args.sharedLibraryPath }) });
}

function inlineResult(value: CanonicalValue): MediaOperationResult {
  return { value };
}

function artifactResult(value: BlobRef): MediaOperationResult {
  return { value };
}

function inspectNeed(value: CanonicalValue): InspectMediaNeed {
  const item = object(value, "InspectMediaNeed") as unknown as InspectMediaNeed;
  assert(item.source?.kind === "blob", "InspectMediaNeed is invalid");
  return item;
}

type AudioRenderSourceBaseNeed = {
  readonly source: BlobRef;
  readonly sourceDuration: ExactTemporalValue;
  readonly streamIndex: number;
};

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

function renderStillVideoNeed(value: CanonicalValue): RenderStillVideoNeed {
  const item = object(value, "RenderStillVideoNeed") as unknown as RenderStillVideoNeed;
  verifyStillVideoRequest(item.request);
  assert(item.request.segments.every((segment) => segment.source?.kind === "blob" && segment.source.mediaType.startsWith("image/")),
    "RenderStillVideoNeed needs an image Artifact for every segment");
  return item;
}

function evidenceAudioNeed(value: CanonicalValue): ProjectSpeechEvidenceAudioNeed {
  const item = object(value, "ProjectSpeechEvidenceAudioNeed") as unknown as ProjectSpeechEvidenceAudioNeed;
  verifyPreparedAudioSource(item.source);
  assertTemporalMap(item.preparation);
  assert(item.preparation.stages.at(-1)!.source.id === item.source.sourceDomain.id,
    "Speech evidence preparation does not end at its selected audio source");
  speechEvidenceSampleFrames(item.preparation.stages[0]!.target);
  return item;
}

function renderAudioNeed(value: CanonicalValue): RenderAudioNeed {
  const item = object(value, "RenderAudioNeed") as unknown as RenderAudioNeed;
  verifyAudioProgram(item.program);
  if (item.range !== undefined) assertFrameSpan(item.range, item.program.frameCount);
  return item;
}

function muxMediaNeed(value: CanonicalValue): MuxMediaNeed {
  const item = object(value, "MuxMediaNeed") as unknown as MuxMediaNeed;
  verifyTimelineVisual(item.visual);
  verifyTimelineAudio(item.audio);
  verifyMediaDeliverySpec(item.delivery);
  assert(sameVisualDeliverySpec(item.visual.delivery, item.delivery.visual),
    "MuxMediaNeed visual differs from its delivery requirement");
  assert(item.audio.sampleRate === item.delivery.audio.sampleRate
    && item.audio.channelLayout === item.delivery.audio.channelLayout,
  "MuxMediaNeed audio differs from its delivery requirement");
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

function decimal(value: number): string {
  assert(Number.isFinite(value), "Media execution produced a non-finite number");
  return value.toPrecision(15);
}

async function assertCanonicalWav(args: {
  readonly path: string;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxProbeOutputBytes: number;
  readonly sharedLibraryPath?: string;
}): Promise<MediaAudioStream> {
  const inspection = await inspectFile({
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
  const work = await mkdtemp(join(tmpdir(), "hypit-media-inspect-"));
  try {
    const input = join(work, "source.bin");
    const animationBytes = need.source.mediaType === "image/webp" ? await sourceBytes(env, need.source) : undefined;
    if (animationBytes === undefined) await stageArtifact(env, need.source, input);
    else await writeFile(input, animationBytes);
    const animation = animationBytes === undefined ? undefined : parseAnimatedWebp(animationBytes);
    const inspection = animation === undefined
      ? await inspectFile({
        input,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      })
      : animatedWebpInspection(animation);
    return inlineResult(canonicalize(inspection));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

async function sourceVideoEncoding(env: MediaExecutionEnvironment, path: string, streamIndex: number) {
  const bytes = await runProcess({
    executable: env.ffprobePath,
    argv: ["-v", "error", "-print_format", "json", "-show_streams", "-show_pixel_formats", "-show_format", path],
    timeoutMs: env.processTimeoutMs, maxStdoutBytes: env.maxProbeOutputBytes,
    ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
  });
  const probe = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
    streams: { index: number; codec_name?: string; profile?: string; level?: number; pix_fmt?: string;
      time_base?: string; sample_aspect_ratio?: string; width?: number; height?: number;
      tags?: Record<string, string>; side_data_list?: { rotation?: number }[] }[];
    pixel_formats: { name: string; flags: { alpha: number } }[];
    format?: { nb_streams?: number; format_name?: string };
  };
  const stream = probe.streams.find((item) => item.index === streamIndex);
  assert(stream !== undefined, `Media source has no video stream ${streamIndex}`);
  const pixelFormat = probe.pixel_formats.find((item) => item.name === stream.pix_fmt);
  assert(pixelFormat !== undefined, `Media source pixel format ${String(stream.pix_fmt)} is unknown`);
  const alphaTag = Object.entries(stream.tags ?? {}).find(([key]) => key.toLowerCase() === "alpha_mode")?.[1];
  const alpha = pixelFormat.flags.alpha === 1 || alphaTag === "1" || alphaTag === "straight";
  // FFmpeg's native VP8/VP9 decoders discard the WebM alpha sidecar.
  const decoder = !alpha ? undefined
    : stream.codec_name === "vp9" ? "libvpx-vp9" : stream.codec_name === "vp8" ? "libvpx" : undefined;
  return {
    alpha,
    pixelFormat: stream.pix_fmt,
    stream,
    formatNames: probe.format?.format_name?.split(",") ?? [],
    streamCount: probe.format?.nb_streams,
    inputArgs: decoder === undefined ? [] : [`-c:${streamIndex}`, decoder],
  };
}

async function decodeAudioRenderSource(
  env: MediaExecutionEnvironment,
  need: AudioRenderSourceBaseNeed,
): Promise<AudioRenderSource> {
  const plan = audioRenderSourcePlan(need);
  const work = await mkdtemp(join(tmpdir(), "hypit-audio-render-source-"));
  try {
    const input = join(work, "source.bin");
    const output = join(work, "audio.wav");
    await stageArtifact(env, need.source, input);
    const filter = [
      "asetpts=PTS-STARTPTS",
      `aresample=${plan.sampleRate}:async=0:first_pts=0`,
      `aformat=sample_rates=${plan.sampleRate}:channel_layouts=stereo`,
      `apad=whole_len=${plan.sampleFrames}`,
      `atrim=start_sample=0:end_sample=${plan.sampleFrames}`,
      "asetpts=N/SR/TB",
    ].join(",");
    await runProcess({
      executable: env.ffmpegPath,
      argv: ["-y", "-i", input, "-map", `0:${plan.streamIndex}`, "-vn", "-af", filter,
        "-c:a", "pcm_s16le", "-ar", String(plan.sampleRate), "-ac", "2", output],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const inspected = await outputInspection({
      path: output,
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const audio = inspected.streams.find((item): item is MediaAudioStream => item.kind === "audio");
    assert(audio?.decodedSampleFrames === plan.sampleFrames
      && audio.sampleRate === plan.sampleRate && audio.channels === 2,
    "Audio render source sample shape differs from its plan");
    return sealAudioRenderSource({
      artifact: await env.artifacts.putFile(output, "audio/wav"),
      sampleRate: plan.sampleRate,
      sampleFrames: plan.sampleFrames,
    });
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
async function decodePreparedAudioBase(
  env: MediaExecutionEnvironment,
  source: PreparedAudioSource,
): Promise<AudioRenderSource> {
  return await decodeAudioRenderSource(env, {
    source: source.source,
    streamIndex: source.streamIndex,
    sourceDuration: source.sourceDomain.duration,
  });
}

/**
 * Encode authored images into an exact video-only CFR clip. One picture is held for the whole frame
 * count; several are each held for their planned segment, fitted into the first picture's frame
 * and letterboxed on black, then concatenated in order.
 */
export async function executeRenderStillVideo(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = renderStillVideoNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "hypit-media-still-"));
  try {
    const output = join(work, "still.mp4");
    const staged = new Map<string, string>();
    const inputs: string[] = [];
    for (const segment of need.request.segments) {
      const source = segment.source!;
      let path = staged.get(source.resource);
      if (path === undefined) {
        path = join(work, `picture-${staged.size}.image`);
        await stageArtifact(env, source, path);
        staged.set(source.resource, path);
      }
      inputs.push(path);
    }
    const { numerator, denominator } = need.request.frameRate;
    const fps = `${numerator}/${denominator}`;
    const hold = (frames: number): string => [
      "select=eq(n\\,0)",
      "loop=loop=-1:size=1:start=0",
      `trim=start_frame=0:end_frame=${frames}`,
      `settb=expr=${denominator}/${numerator}`,
      `setpts=N*${denominator}/(${numerator}*TB)`,
    ].join(",");
    const bt709Output = [
      "scale=out_color_matrix=bt709:out_range=tv",
      "format=yuv420p",
      "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
    ].join(",");
    let argv: string[];
    if (need.request.segments.length === 1) {
      const filter = `${hold(need.request.frameCount)},pad=ceil(iw/2)*2:ceil(ih/2)*2:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,${bt709Output}`;
      argv = ["-y", "-i", inputs[0]!, "-map", "0:v:0", "-an", "-vf", filter];
    } else {
      const first = await outputInspection({
        path: inputs[0]!,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      });
      const picture = first.streams.find((item): item is MediaVideoStream => item.kind === "video");
      assert(picture !== undefined, "Still video first picture has no decodable image");
      const width = Math.ceil(picture.width / 2) * 2;
      const height = Math.ceil(picture.height / 2) * 2;
      const chains = need.request.segments.map((segment, index) =>
        `[${index}:v]${hold(segment.endFrameExclusive - segment.startFrame)},`
        + `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[s${index}]`);
      const concat = `${need.request.segments.map((_, index) => `[s${index}]`).join("")}concat=n=${need.request.segments.length}:v=1:a=0[joined];[joined]${bt709Output}[v]`;
      argv = ["-y", ...inputs.flatMap((path) => ["-i", path]), "-filter_complex", `${chains.join(";")};${concat}`, "-map", "[v]", "-an"];
    }
    await runProcess({
      executable: env.ffmpegPath,
      argv: [
        ...argv,
        "-frames:v", String(need.request.frameCount), "-r", fps, "-fps_mode", "cfr",
        "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", output,
      ],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const inspected = await outputInspection({
      path: output,
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const videos = inspected.streams.filter((item): item is MediaVideoStream => item.kind === "video");
    assert(videos.length === 1 && inspected.streams.length === 1
      && videos[0]!.decodedUnitCount === need.request.frameCount,
    "Still media output differs from its requested frame domain");
    const visual = videos[0]!;
    assert(visual.sampleAspectRatio.numerator === 1 && visual.sampleAspectRatio.denominator === 1
      && visual.rotationDegrees === 0,
    "Still media output retains non-square samples or display rotation");
    assert(visual.averageFrameRate !== undefined
      && visual.averageFrameRate.numerator * need.request.frameRate.denominator
        === need.request.frameRate.numerator * visual.averageFrameRate.denominator,
    "Still media output differs from its requested frame rate");
    return artifactResult(await env.artifacts.putFile(output, "video/mp4"));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** Generic model-reference audio: no Narrative or alignment claim is introduced. */
export async function executeExtractAudio(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = extractAudioNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "hypit-media-extract-audio-"));
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
  const work = await mkdtemp(join(tmpdir(), "hypit-media-extract-frame-"));
  try {
    const input = join(work, "source.bin");
    const output = join(work, "frame.png");
    await stageArtifact(env, need.source, input);
    const encoding = await sourceVideoEncoding(env, input, need.streamIndex);
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
        "-y", ...encoding.inputArgs, "-i", input, "-map", `0:${need.streamIndex}`, "-an",
        "-vf", `setpts=PTS-STARTPTS,select=${selection}`,
        "-frames:v", "1", "-fps_mode", "vfr", "-c:v", "png", output,
      ],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    let bytes: Uint8Array;
    try {
      bytes = await readFile(output);
    } catch (error) {
      // ffmpeg may exit successfully when a time selection matches no decoded frame.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      throw new Error(need.at.kind === "time"
        ? `Frame extraction found no frame at ${need.at.seconds}s in the selected stream`
        : "Frame extraction found no frame for its selection", { cause: error });
    }
    assert(bytes.byteLength > 0, "Frame extraction produced no image");
    const inspected = await outputInspection({
      path: output,
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

const speechClock = { frameRate: { numerator: 16_000, denominator: 1 } } as const;

function speechSampleBoundary(value: ExactTemporalValue): number {
  return resolveTemporalBoundary(value, speechClock, "nearest");
}

function speechStageFilter(
  stage: TemporalMapStage,
  input: string,
  index: number,
): { readonly filters: readonly string[]; readonly output: string } {
  const filters: string[] = [];
  const branches = stage.pieces.map((_, pieceIndex) => `speech-${index}-source-${pieceIndex}`);
  if (branches.length > 1) {
    filters.push(`[${input}]asplit=${branches.length}${branches.map((label) => `[${label}]`).join("")}`);
  }
  const segments: string[] = [];
  let cursor = 0;
  const silence = (sampleFrames: number): void => {
    if (sampleFrames < 1) return;
    const label = `speech-${index}-silence-${segments.length}`;
    filters.push(`anullsrc=r=16000:cl=mono,atrim=start_sample=0:end_sample=${sampleFrames},asetpts=N/SR/TB[${label}]`);
    segments.push(label);
  };
  for (const [pieceIndex, piece] of stage.pieces.entries()) {
    assert(isAffineTemporalMapPiece(piece),
      `Speech evidence audio map stage ${index} is outside this renderer's affine capability.`);
    assert(piece.wrap === undefined, `Speech evidence audio map stage ${index} cannot contain wrap.`);
    assert(piece.rate.numerator > 0, `Speech evidence audio map stage ${index} requires a positive rate.`);
    const targetStart = speechSampleBoundary(piece.target.start);
    const targetEnd = speechSampleBoundary(piece.target.end);
    silence(targetStart - cursor);
    const targetSamples = targetEnd - targetStart;
    if (targetSamples > 0) {
      const targetDuration = subtractExactTemporalValues(piece.target.end, piece.target.start);
      const sourceEnd = addExactTemporalValues(piece.sourceAtStart,
        scaleExactTemporalValue(targetDuration, piece.rate));
      const sourceStartSample = speechSampleBoundary(piece.sourceAtStart);
      const sourceEndSample = speechSampleBoundary(sourceEnd);
      const rate = piece.rate.numerator / piece.rate.denominator;
      const tempo = atempo(rate);
      const label = `speech-${index}-piece-${pieceIndex}`;
      const branch = branches.length > 1 ? branches[pieceIndex]! : input;
      filters.push(`[${branch}]atrim=start_sample=${sourceStartSample}:end_sample=${sourceEndSample},`
        + `asetpts=N/SR/TB,${tempo.join(",")}${tempo.length === 0 ? "" : ","}`
        + `apad=whole_len=${targetSamples},atrim=start_sample=0:end_sample=${targetSamples},`
        + `asetpts=N/SR/TB[${label}]`);
      segments.push(label);
    }
    cursor = targetEnd;
  }
  const stageSamples = speechEvidenceSampleFrames(stage.target);
  silence(stageSamples - cursor);
  const output = `speech-stage-${index}`;
  assert(segments.length > 0, `Speech evidence audio map stage ${index} has no representable signal.`);
  if (segments.length === 1) {
    filters.push(`[${segments[0]}]anull,apad=whole_len=${stageSamples},`
      + `atrim=start_sample=0:end_sample=${stageSamples},asetpts=N/SR/TB[${output}]`);
  } else {
    filters.push(`${segments.map((label) => `[${label}]`).join("")}concat=n=${segments.length}:v=0:a=1,`
      + `apad=whole_len=${stageSamples},atrim=start_sample=0:end_sample=${stageSamples},`
      + `asetpts=N/SR/TB[${output}]`);
  }
  return { filters, output };
}

export async function executeProjectSpeechEvidenceAudio(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = evidenceAudioNeed(constraints);
  const sampleFrames = speechEvidenceSampleFrames(need.preparation.stages[0]!.target);
  const work = await mkdtemp(join(tmpdir(), "hypit-media-speech-evidence-"));
  try {
    const input = join(work, "source-media");
    const output = join(work, "speech-evidence.wav");
    await stageArtifact(env, need.source.source, input);
    const sourceSamples = speechEvidenceSampleFrames(need.source.sourceDomain);
    const filters: string[] = [
      `[0:${need.source.streamIndex}]aresample=16000:async=0:first_pts=0,`
      + `aformat=sample_rates=16000:channel_layouts=mono,asetpts=N/SR/TB,`
      + `apad=whole_len=${sourceSamples},atrim=start_sample=0:end_sample=${sourceSamples},`
      + "asetpts=N/SR/TB[speech-source]",
    ];
    let current = "speech-source";
    for (const [index, stage] of [...need.preparation.stages].reverse().entries()) {
      const rendered = speechStageFilter(stage, current, index);
      filters.push(...rendered.filters);
      current = rendered.output;
    }
    await runProcess({
      executable: env.ffmpegPath,
      argv: ["-y", "-i", input, "-filter_complex", filters.join(";"), "-map", `[${current}]`,
        "-vn", "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1", output],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const inspected = await outputInspection({
      path: output,
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
      && streams[0]!.decodedSampleFrames === sampleFrames,
    "Speech evidence must be exact 16 kHz mono PCM s16 on the Prepared Media domain");
    const artifact = await env.artifacts.putFile(output, "audio/wav");
    const evidence: SpeechEvidenceAudio = sealSpeechEvidenceAudio({ artifact, sampleFrames });
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
  const program: AudioProgram = need.program;
  const window = need.range === undefined
    ? { startSample: 0, endSampleExclusive: program.sampleFrames, sampleFrames: program.sampleFrames }
    : clockFrameSpanSamples(need.range, { frameRate: program.frameRate }, 48_000);
  const work = await mkdtemp(join(tmpdir(), "hypit-media-audio-"));
  const readers = new Set<CanonicalPcmReader>();
  try {
    const rendererEnv = await privateMediaExecutionEnvironment(env, join(work, "decoded-sources"));
    const sources = new Map<string, {
      readonly source: PreparedAudioSource;
      readonly path: string;
      readonly reader: CanonicalPcmReader;
    }>();
    // Clip ids are local to their owning AudioProgram. Recursive Compositions may
    // therefore contain the same authored id without sharing an execution slot.
    const clipSources = new Map<AudioProgramClip, CanonicalPcmReader>();
    const clipSourcePaths = new Map<AudioProgramClip, string>();
    const reconstructed = new Map<AudioProgramClip, CanonicalPcmReader>();
    const prepareClips = async (clips: ReadonlySet<AudioProgramClip>) => {
      for (const clip of clips) {
        if (clipSources.has(clip)) continue;
        const key = `${clip.source.source.resource}\u0000${clip.source.streamIndex}`;
        let decoded = sources.get(key);
        if (decoded === undefined) {
          const path = join(work, `source-${sources.size}.wav`);
          const renderSource = await decodePreparedAudioBase(rendererEnv, clip.source);
          await stageArtifact(rendererEnv, renderSource.artifact, path);
          const audio = await assertCanonicalWav({
            path,
            ffprobePath: env.ffprobePath,
            timeoutMs: env.processTimeoutMs,
            maxProbeOutputBytes: env.maxProbeOutputBytes,
            ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
          });
          assert(audio.decodedSampleFrames === renderSource.sampleFrames,
            `Audio renderer source ${clip.id} differs from its decoded domain`);
          const reader = new CanonicalPcmReader(path, renderSource.sampleFrames);
          readers.add(reader);
          decoded = { source: clip.source, path, reader };
          sources.set(key, decoded);
        } else {
          assert(compareExactTemporalValues(decoded.source.sourceDomain.duration,
            clip.source.sourceDomain.duration) === 0,
          `Audio renderer source ${clip.id} reuses one stream with a different domain`);
        }
        clipSources.set(clip, decoded.reader);
        clipSourcePaths.set(clip, decoded.path);
      }

      for (const clip of clips) {
        if (clip.reconstruction === undefined || reconstructed.has(clip)) continue;
        readPreservePitch(clip.reconstruction);
        const plan = planPositiveAffineReconstruction(clip);
        const source = clipSources.get(clip);
        const sourcePath = clipSourcePaths.get(clip);
        assert(source !== undefined && sourcePath !== undefined,
          `Audio renderer Clip ${clip.id} has no decoded source for reconstruction`);
        assert(plan.sourceEndSampleExclusive <= source.sampleFrames,
          `Audio renderer Clip ${clip.id} reconstruction exceeds its selected source`);
        const path = join(work, `reconstructed-${reconstructed.size}.wav`);
        const tempo = atempo(plan.rate);
        const filters = [
          `atrim=start_sample=${plan.sourceStartSample}:end_sample=${plan.sourceEndSampleExclusive}`,
          "asetpts=N/SR/TB",
          ...tempo,
          `apad=whole_len=${plan.targetSampleFrames}`,
          `atrim=start_sample=0:end_sample=${plan.targetSampleFrames}`,
          "asetpts=N/SR/TB",
        ];
        await runProcess({
          executable: env.ffmpegPath,
          argv: ["-y", "-i", sourcePath, "-af", filters.join(","), "-vn",
            "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", path],
          timeoutMs: env.processTimeoutMs,
          maxStdoutBytes: 64 * 1024,
          ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
        });
        const reader = new CanonicalPcmReader(path, plan.targetSampleFrames);
        readers.add(reader);
        reconstructed.set(clip, reader);
      }

    };

    const output = join(work, "program.wav");
    await renderAudioProgramWav({
      path: output,
      program,
      startSample: window.startSample,
      sampleFrames: window.sampleFrames,
      prepareClips,
      sourceForClip: (clip) => {
        const reader = clipSources.get(clip);
        assert(reader !== undefined, `Audio renderer Clip ${clip.id} has no decoded source`);
        return reader;
      },
      reconstructedForClip: (clip) => reconstructed.get(clip),
    });
    const artifact = await env.artifacts.putFile(output, "audio/wav");
    const audio = await assertCanonicalWav({
      path: output,
      ffprobePath: env.ffprobePath,
      timeoutMs: env.processTimeoutMs,
      maxProbeOutputBytes: env.maxProbeOutputBytes,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    assert(audio.decodedSampleFrames === window.sampleFrames,
      "Rendered TimelineAudio sample count differs from its program");
    const value: TimelineAudio = sealTimelineAudio({
      artifact,
      sampleRate: 48_000,
      channelLayout: "stereo",
      sampleFrames: window.sampleFrames,
    });
    return inlineResult(canonicalize(value));
  } finally {
    for (const reader of readers) reader.close();
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function executeMuxProgramMedia(
  env: MediaExecutionEnvironment,
  constraints: CanonicalValue,
): Promise<MediaOperationResult> {
  const need = muxMediaNeed(constraints);
  const work = await mkdtemp(join(tmpdir(), "hypit-media-mux-"));
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
        input: visualPath,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      }),
      assertCanonicalWav({
        path: audioPath,
        ffprobePath: env.ffprobePath,
        timeoutMs: env.processTimeoutMs,
        maxProbeOutputBytes: env.maxProbeOutputBytes,
        ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
      }),
    ]);
    const visualStreams = visualInspection.streams.filter((item): item is MediaVideoStream => item.kind === "video");
    assert(visualStreams.length === 1 && visualInspection.streams.length === 1,
      "TimelineVisual Artifact must contain exactly one silent video stream");
    const visual = visualStreams[0]!;
    assert(!visual.disposition.attachedPicture && visual.timingStatus === "admissible"
      && visual.decodedUnitCount === need.visual.frameCount
      && visual.width === need.visual.canvas.width && visual.height === need.visual.canvas.height,
    "TimelineVisual bytes differ from their declared frame domain");
    assert(audio.decodedSampleFrames === need.audio.sampleFrames,
      "TimelineAudio bytes differ from their declared sample domain");
    await runProcess({
      executable: env.ffmpegPath,
      argv: [
        "-y", "-i", visualPath, "-i", audioPath,
        "-map", `0:${visual.index}`, "-map", "1:0",
        "-c:v", "copy", "-c:a", need.delivery.audio.codec,
        "-ar", String(need.delivery.audio.sampleRate), "-ac", "2",
        "-movflags", "+faststart", output,
      ],
      timeoutMs: env.processTimeoutMs,
      maxStdoutBytes: 64 * 1024,
      ...(env.sharedLibraryPath === undefined ? {} : { sharedLibraryPath: env.sharedLibraryPath }),
    });
    const finalInspection = await outputInspection({
      path: output,
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
      "Final mux video frame count differs from TimelineVisual");
    assert(finalAudio[0]!.timingStatus === "admissible"
      && finalAudio[0]!.sampleRate === 48_000 && finalAudio[0]!.channels === 2,
      "Final mux audio shape differs from TimelineAudio");
    assert(finalVideo[0]!.startPts !== undefined && finalAudio[0]!.startPts !== undefined
      && compareTimestamp(finalVideo[0]!.startPts, finalAudio[0]!.startPts) === 0,
    "Final mux audio and video do not share one presentation origin");
    const finalAudioSpan = duration(finalAudio[0]!);
    /*
     * The staged WAV is asserted sample-exact above; this checks what survived AAC.
     *
     * AAC cannot carry an arbitrary sample count: the encoder emits 1024-sample frames and
     * reports a priming delay that the MP4 muxer compensates with an edit list, so the
     * presented span lands a few samples away from the input. Measured here with ffmpeg 6.1
     * on synthetic tone (i.e. independent of any project's material): a 4 249 600-sample input
     * presents as 4 249 584 (-16), and 4 236 800 presents as 4 236 768 (-32). Padding the
     * timeline to a whole number of AAC frames does not remove it — the delay is not a
     * frame-alignment artifact.
     *
     * Demanding exact equality therefore rejects every correct mux whose length is not a
     * fixed point of that round trip. The real invariant AAC can hold is that no whole frame
     * of audio went missing, so the tolerance is one AAC frame rather than an arbitrary epsilon;
     * anything larger still means genuine desync and still fails.
     */
    const AAC_FRAME_SAMPLES = 1_024;
    const finalAudioSamples = roundPositive(finalAudioSpan.numerator * 48_000n, finalAudioSpan.denominator);
    assert(Math.abs(finalAudioSamples - need.audio.sampleFrames) < AAC_FRAME_SAMPLES,
      `Final mux audio presentation span differs from TimelineAudio by ${
        String(finalAudioSamples - need.audio.sampleFrames)} samples`);
    const artifact = await env.artifacts.putFile(output, "video/mp4");
    const value: MuxedMedia = sealMuxedMedia({
      frameRate: need.visual.frameRate,
      frameCount: need.visual.frameCount,
      canvas: need.visual.canvas,
      presentationSampleFrames: need.audio.sampleFrames,
      delivery: need.delivery,
      artifact,
    });
    return inlineResult(canonicalize(value));
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
