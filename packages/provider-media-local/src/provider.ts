import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  contractTypes,
  sealMuxedMedia,
  sealSpeechEvidenceAudio,
  speechEvidenceSampleBoundary,
  sealSynchronizedMedia,
  sealTimelineAudio,
  verifyMediaInspection,
  verifyMediaStreamSelection,
  verifyRenderedVisual,
  assertSpeechEvidenceAudioIdentity,
  verifyTimelineAudio,
} from "@narratage/video-contracts";
import type {
  MediaAudioStream,
  MediaInspection,
  MediaRational,
  MediaStream,
  MediaStreamSelection,
  MediaTimestamp,
  MediaVideoStream,
  MuxedMedia,
  SynchronizedMedia,
  SpeechEvidenceAudio,
  TimelineAudio,
} from "@narratage/video-contracts";
import type { EndpointInvocationContext, EndpointFulfillment } from "@narratage/endpoint-kit";
import {
  mediaPipelineCapabilities,
  verifyAudioProgramPlan,
  type InspectMediaNeed,
  type MuxMediaNeed,
  type NormalizeMediaNeed,
  type ProjectSpeechEvidenceAudioNeed,
  type RenderAudioNeed,
} from "@narratage/media-pipeline";
import type { AudioProgramClip, AudioProgramPlan } from "@narratage/media-pipeline";
import {
  canonicalize,
  digestOf,
} from "@narratage/protocol";
import type { BlobRef, CanonicalValue } from "@narratage/protocol";
import { defineEndpointPackage } from "@narratage/endpoint-kit";

import { parseMediaInspection } from "./probe.js";

export const localMediaProviderModuleRef = { name: "@narratage/provider-media-local", version: "0.0.0-dev" } as const;
export const localMediaProviderImplementationDigest = digestOf("@narratage/provider-media-local/ffmpeg@2");

export type CreateLocalMediaProviderOptions = {
  readonly instance?: string;
  readonly lane?: string;
  readonly ffmpegPath?: string;
  readonly ffprobePath?: string;
  readonly defaultConcurrency?: number;
  readonly processTimeoutMs?: number;
  readonly maxProbeOutputBytes?: number;
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

function hasContract(value: unknown, contract: string): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).contract === contract;
}

async function runProcess(args: {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
}): Promise<Uint8Array> {
  return await new Promise((resolve, reject) => {
    const child = spawn(args.executable, [...args.argv], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "" },
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

async function version(executable: string, timeoutMs: number): Promise<string> {
  const bytes = await runProcess({ executable, argv: ["-version"], timeoutMs, maxStdoutBytes: 64 * 1024 });
  const line = Buffer.from(bytes).toString("utf8").split(/\r?\n/u, 1)[0]?.trim();
  assert(line !== undefined && line.length > 0, `${executable} returned no version`);
  return line;
}

async function sourceBytes(context: EndpointInvocationContext, source: BlobRef): Promise<Uint8Array> {
  const bytes = await context.artifacts.get(source.digest);
  assert(bytes !== undefined, `Media source ${source.digest} is unavailable`);
  assert(bytes.byteLength === source.size, `Media source ${source.digest} size differs`);
  return bytes;
}

async function stageArtifact(
  context: EndpointInvocationContext,
  source: BlobRef,
  path: string,
): Promise<void> {
  await writeFile(path, await sourceBytes(context, source));
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
  readonly origin: MediaTimestamp;
  readonly end: MediaTimestamp;
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
      origin: authority.startPts,
      end: authority.endPts,
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
    origin: authority.startPts,
    end: authority.endPts,
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
}): Promise<MediaInspection> {
  const [raw, ffprobeVersion] = await Promise.all([
    runProcess({
      executable: args.ffprobePath,
      argv: ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "-show_frames", args.input],
      timeoutMs: args.timeoutMs,
      maxStdoutBytes: args.maxProbeOutputBytes,
    }),
    version(args.ffprobePath, args.timeoutMs),
  ]);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw).toString("utf8"));
  } catch {
    throw new Error("ffprobe returned invalid JSON");
  }
  return parseMediaInspection({ source: args.source, ffprobeVersion, value });
}

async function outputInspection(args: {
  readonly path: string;
  readonly mediaType: string;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxProbeOutputBytes: number;
}): Promise<MediaInspection> {
  const bytes = await readFile(args.path);
  const source: BlobRef = {
    kind: "blob",
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` as BlobRef["digest"],
    size: bytes.byteLength,
    mediaType: args.mediaType,
  };
  return await inspectFile({ source, input: args.path, ffprobePath: args.ffprobePath,
    timeoutMs: args.timeoutMs, maxProbeOutputBytes: args.maxProbeOutputBytes });
}

function result(value: CanonicalValue, metadata: CanonicalValue): EndpointFulfillment {
  return {
    value: { kind: "inline", value },
    conformance: "exact",
    delivery: "executed",
    metadata,
  };
}

function inspectNeed(value: CanonicalValue): InspectMediaNeed {
  const item = object(value, "InspectMediaNeed") as unknown as InspectMediaNeed;
  assert(item.contract === "svml.inspect-media-request@1" && item.source?.kind === "blob",
    "InspectMediaNeed is invalid");
  return item;
}

function normalizeNeed(value: CanonicalValue): NormalizeMediaNeed {
  const item = object(value, "NormalizeMediaNeed") as unknown as NormalizeMediaNeed;
  assert(item.contract === "svml.normalize-media-request@1" && item.source?.kind === "blob",
    "NormalizeMediaNeed is invalid");
  verifyMediaInspection(item.inspection);
  verifyMediaStreamSelection(item.selection);
  assert(item.audio.sampleRate === 48_000 && item.audio.channels === 2
    && item.audio.codec === "pcm_s16le" && item.audio.loudness === "preserve",
  "NormalizeMediaNeed audio profile is unsupported");
  return item;
}

function evidenceAudioNeed(value: CanonicalValue): ProjectSpeechEvidenceAudioNeed {
  const item = object(value, "ProjectSpeechEvidenceAudioNeed") as unknown as ProjectSpeechEvidenceAudioNeed;
  assert(item.contract === "svml.project-speech-evidence-audio-request@1" && item.source?.kind === "blob",
    "ProjectSpeechEvidenceAudioNeed is invalid");
  assert(item.sourceSampleRate === 48_000 && item.sourceChannels === 2 && item.sourceCodec === "pcm_s16le"
    && item.evidenceSampleRate === 16_000 && item.evidenceChannels === 1 && item.evidenceCodec === "pcm_s16le",
  "Speech evidence audio shape is invalid");
  assert(Number.isSafeInteger(item.sourceSampleFrames) && item.sourceSampleFrames > 0
    && Number.isSafeInteger(item.evidenceSampleFrames) && item.evidenceSampleFrames > 0
    && item.evidenceSampleFrames === speechEvidenceSampleBoundary(item.sourceSampleFrames),
  "Speech evidence audio sample map is invalid");
  return item;
}

function renderAudioNeed(value: CanonicalValue): RenderAudioNeed {
  const item = object(value, "RenderAudioNeed") as unknown as RenderAudioNeed;
  assert(item.contract === "svml.render-audio-request@1", "RenderAudioNeed is invalid");
  verifyAudioProgramPlan(item.plan);
  return item;
}

function muxMediaNeed(value: CanonicalValue): MuxMediaNeed {
  const item = object(value, "MuxMediaNeed") as unknown as MuxMediaNeed;
  assert(item.contract === "svml.mux-media-request@1", "MuxMediaNeed is invalid");
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
  const filters = [
    `atrim=start_sample=${clip.sourceStartSample}`,
    "asetpts=PTS-STARTPTS",
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
}): Promise<MediaAudioStream> {
  const inspection = await inspectFile({
    source: args.source,
    input: args.path,
    ffprobePath: args.ffprobePath,
    timeoutMs: args.timeoutMs,
    maxProbeOutputBytes: args.maxProbeOutputBytes,
  });
  const audio = inspection.streams.filter((item): item is MediaAudioStream => item.kind === "audio");
  assert(audio.length === 1 && inspection.streams.length === 1, "Canonical audio must contain exactly one stream");
  assert(audio[0]!.codecName === "pcm_s16le" && audio[0]!.sampleRate === 48_000 && audio[0]!.channels === 2,
    "Canonical audio must be 48 kHz stereo PCM s16");
  assert(audio[0]!.timingStatus === "admissible", "Canonical audio timing is not admissible");
  return audio[0]!;
}

export function createLocalMediaProvider(config: CreateLocalMediaProviderOptions = {}) {
  const ffmpegPath = config.ffmpegPath ?? "ffmpeg";
  const ffprobePath = config.ffprobePath ?? "ffprobe";
  const processTimeoutMs = positiveInteger(config.processTimeoutMs ?? 10 * 60_000, "processTimeoutMs");
  const maxProbeOutputBytes = positiveInteger(config.maxProbeOutputBytes ?? 256 * 1024 * 1024,
    "maxProbeOutputBytes");
  const common = { ffmpegPath, ffprobePath, processTimeoutMs, maxProbeOutputBytes };
  return defineEndpointPackage({
    module: localMediaProviderModuleRef,
    facet: "media",
    instance: config.instance ?? "media.local",
    ...(config.lane === undefined ? {} : { lane: config.lane }),
    implementation: {
      locator: "@narratage/provider-media-local/ffmpeg",
      digest: localMediaProviderImplementationDigest,
    },
    permissions: ["process:media"],
    configuration: canonicalize(common),
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.inspect,
        returns: contractTypes.mediaInspection,
        supports: (need) => hasContract(need.constraints, "svml.inspect-media-request@1"),
        handler: async (context) => {
          const need = inspectNeed(context.need.constraints);
          const work = await mkdtemp(join(tmpdir(), "svml-media-inspect-"));
          try {
            const input = join(work, "source.bin");
            await writeFile(input, await sourceBytes(context, need.source));
            const inspection = await inspectFile({
              source: need.source,
              input,
              ffprobePath,
              timeoutMs: processTimeoutMs,
              maxProbeOutputBytes,
            });
            return result(canonicalize(inspection), canonicalize({ provider: "media.local", operation: "inspect" }));
          } finally {
            await rm(work, { recursive: true, force: true }).catch(() => {});
          }
        },
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.normalize,
        returns: contractTypes.synchronizedMedia,
        supports: (need) => hasContract(need.constraints, "svml.normalize-media-request@1"),
        handler: async (context) => {
          const need = normalizeNeed(context.need.constraints);
          const plan = normalizationPlan(need.inspection, need.selection, need.frameRate);
          const work = await mkdtemp(join(tmpdir(), "svml-media-normalize-"));
          try {
            const input = join(work, "source.bin");
            await writeFile(input, await sourceBytes(context, need.source));
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
                "scale=trunc(iw/2)*2:trunc(ih/2)*2",
              ].join(",");
              await runProcess({
                executable: ffmpegPath,
                argv: ["-y", "-i", input, "-map", `0:${plan.video.index}`, "-an", "-vf", filter,
                  "-frames:v", String(plan.frameCount), "-fps_mode", "cfr", "-c:v", "libx264",
                  "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
                timeoutMs: processTimeoutMs,
                maxStdoutBytes: 64 * 1024,
              });
              const inspected = await outputInspection({
                path: output,
                mediaType: "video/mp4",
                ffprobePath,
                timeoutMs: processTimeoutMs,
                maxProbeOutputBytes,
              });
              const visual = inspected.streams.find((item): item is MediaVideoStream => item.kind === "video");
              assert(visual?.decodedUnitCount === plan.frameCount && visual.role === "moving",
                "Normalized visual frame shape differs from its plan");
              const bytes = await readFile(output);
              visualArtifact = await context.artifacts.put(bytes, "video/mp4");
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
                executable: ffmpegPath,
                argv: ["-y", "-i", input, "-map", `0:${plan.audio.index}`, "-vn", "-af", filter,
                  "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", output],
                timeoutMs: processTimeoutMs,
                maxStdoutBytes: 64 * 1024,
              });
              const inspected = await outputInspection({
                path: output,
                mediaType: "audio/wav",
                ffprobePath,
                timeoutMs: processTimeoutMs,
                maxProbeOutputBytes,
              });
              const audio = inspected.streams.find((item): item is MediaAudioStream => item.kind === "audio");
              assert(audio?.decodedSampleFrames === plan.sampleFrames && audio.sampleRate === 48_000 && audio.channels === 2,
                "Normalized audio sample shape differs from its plan");
              audioArtifact = await context.artifacts.put(await readFile(output), "audio/wav");
            }
            const media = sealSynchronizedMedia({
              contract: "svml.synchronized-media@1",
              timeline: {
                spanAuthority: need.selection.spanAuthority,
                frameRate: need.frameRate,
                frameCount: plan.frameCount,
                sampleRate: 48_000,
                sampleFrames: plan.sampleFrames,
              },
              sourceMap: {
                sourceOriginPts: plan.origin,
                sourceEndPts: plan.end,
                audioTrimStartSamples: plan.audioTrimStartSamples,
                audioTrimEndSamples: plan.audioTrimEndSamples,
                audioHeadSamples: plan.audioHeadSamples,
                audioContentSamples: plan.audioContentSamples,
                audioTailSamples: plan.audioTailSamples,
              },
              ...(visualArtifact === undefined ? {} : {
                visual: {
                  artifact: visualArtifact,
                  sourceStreamIndex: plan.video!.index,
                  width: visualWidth!,
                  height: visualHeight!,
                  frameRate: need.frameRate,
                  frameCount: plan.frameCount,
                  muted: true as const,
                },
              }),
              ...(audioArtifact === undefined ? {} : {
                audio: {
                  artifact: audioArtifact,
                  sourceStreamIndex: plan.audio!.index,
                  codec: "pcm_s16le" as const,
                  sampleRate: 48_000 as const,
                  channels: 2 as const,
                  sampleFrames: plan.sampleFrames,
                  loudness: "preserved" as const,
                },
              }),
            });
            return result(canonicalize(media), canonicalize({ provider: "media.local", operation: "normalize",
              visual: visualArtifact !== undefined, audio: audioArtifact !== undefined }));
          } finally {
            await rm(work, { recursive: true, force: true }).catch(() => {});
          }
        },
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.projectSpeechEvidenceAudio,
        returns: contractTypes.speechEvidenceAudio,
        supports: (need) => hasContract(need.constraints, "svml.project-speech-evidence-audio-request@1"),
        handler: async (context) => {
          const need = evidenceAudioNeed(context.need.constraints);
          const work = await mkdtemp(join(tmpdir(), "svml-media-speech-evidence-"));
          try {
            const input = join(work, "speech-master.wav");
            const output = join(work, "alignment-evidence.wav");
            await stageArtifact(context, need.source, input);
            const source = await assertCanonicalWav({
              path: input,
              source: need.source,
              ffprobePath,
              timeoutMs: processTimeoutMs,
              maxProbeOutputBytes,
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
              executable: ffmpegPath,
              argv: ["-y", "-i", input, "-vn", "-af", filter,
                "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1", output],
              timeoutMs: processTimeoutMs,
              maxStdoutBytes: 64 * 1024,
            });
            const inspected = await outputInspection({
              path: output,
              mediaType: "audio/wav",
              ffprobePath,
              timeoutMs: processTimeoutMs,
              maxProbeOutputBytes,
            });
            const streams = inspected.streams.filter((item): item is MediaAudioStream => item.kind === "audio");
            assert(streams.length === 1 && inspected.streams.length === 1
              && streams[0]!.codecName === "pcm_s16le"
              && streams[0]!.sampleRate === 16_000
              && streams[0]!.channels === 1
              && streams[0]!.decodedSampleFrames === need.evidenceSampleFrames,
            "Alignment evidence must be exact 16 kHz mono PCM s16");
            const artifact = await context.artifacts.put(await readFile(output), "audio/wav");
            const evidence: SpeechEvidenceAudio = sealSpeechEvidenceAudio({
              contract: "svml.speech-evidence-audio@1",
              artifact,
              codec: "pcm_s16le",
              sampleRate: 16_000,
              channels: 1,
              sampleFrames: need.evidenceSampleFrames,
              durationSec: need.durationSec,
              segments: need.segments,
              sampleMap: {
                algorithm: "rational-boundary-round@1",
                sourceSampleRate: 48_000,
                evidenceSampleRate: 16_000,
                sourceSampleFrames: need.sourceSampleFrames,
                evidenceSampleFrames: need.evidenceSampleFrames,
                sourceOriginSample: 0,
                evidenceOriginSample: 0,
              },
            });
            assertSpeechEvidenceAudioIdentity(evidence);
            return result(canonicalize(evidence), canonicalize({
              provider: "media.local",
              operation: "project-speech-evidence-audio",
              sourceSampleFrames: need.sourceSampleFrames,
              evidenceSampleFrames: need.evidenceSampleFrames,
            }));
          } finally {
            await rm(work, { recursive: true, force: true }).catch(() => {});
          }
        },
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.renderAudio,
        returns: contractTypes.timelineAudio,
        supports: (need) => hasContract(need.constraints, "svml.render-audio-request@1"),
        handler: async (context) => {
          const need = renderAudioNeed(context.need.constraints);
          const plan: AudioProgramPlan = need.plan;
          const work = await mkdtemp(join(tmpdir(), "svml-media-audio-"));
          try {
            const artifacts = new Map<string, { source: BlobRef; path: string; inputIndex: number }>();
            for (const clip of plan.clips) {
              if (artifacts.has(clip.artifact.digest)) continue;
              const inputIndex = artifacts.size;
              const path = join(work, `input-${inputIndex}.wav`);
              await stageArtifact(context, clip.artifact, path);
              const audio = await assertCanonicalWav({
                path,
                source: clip.artifact,
                ffprobePath,
                timeoutMs: processTimeoutMs,
                maxProbeOutputBytes,
              });
              assert(audio.decodedSampleFrames > 0, `Audio input ${clip.artifact.digest} is empty`);
              artifacts.set(clip.artifact.digest, { source: clip.artifact, path, inputIndex });
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
              executable: ffmpegPath,
              argv,
              timeoutMs: processTimeoutMs,
              maxStdoutBytes: 64 * 1024,
            });
            const bytes = await readFile(output);
            const artifact = await context.artifacts.put(bytes, "audio/wav");
            const audio = await assertCanonicalWav({
              path: output,
              source: artifact,
              ffprobePath,
              timeoutMs: processTimeoutMs,
              maxProbeOutputBytes,
            });
            assert(audio.decodedSampleFrames === plan.sampleFrames,
              "Rendered TimelineAudio sample count differs from its plan");
            const value: TimelineAudio = sealTimelineAudio({
              contract: "svml.timeline-audio@1",
              artifact,
              codec: "pcm_s16le",
              sampleRate: 48_000,
              channels: 2,
              sampleFrames: plan.sampleFrames,
              loudness: "planned",
            });
            return result(canonicalize(value), canonicalize({
              provider: "media.local",
              operation: "render-audio",
              clips: plan.clips.length,
            }));
          } finally {
            await rm(work, { recursive: true, force: true }).catch(() => {});
          }
        },
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.mux,
        returns: contractTypes.muxedMedia,
        supports: (need) => hasContract(need.constraints, "svml.mux-media-request@1"),
        handler: async (context) => {
          const need = muxMediaNeed(context.need.constraints);
          const work = await mkdtemp(join(tmpdir(), "svml-media-mux-"));
          try {
            const visualPath = join(work, "visual.mp4");
            const audioPath = join(work, "audio.wav");
            const output = join(work, "final.mp4");
            await Promise.all([
              stageArtifact(context, need.visual.artifact, visualPath),
              stageArtifact(context, need.audio.artifact, audioPath),
            ]);
            const [visualInspection, audio] = await Promise.all([
              inspectFile({
                source: need.visual.artifact,
                input: visualPath,
                ffprobePath,
                timeoutMs: processTimeoutMs,
                maxProbeOutputBytes,
              }),
              assertCanonicalWav({
                path: audioPath,
                source: need.audio.artifact,
                ffprobePath,
                timeoutMs: processTimeoutMs,
                maxProbeOutputBytes,
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
              executable: ffmpegPath,
              argv: [
                "-y", "-i", visualPath, "-i", audioPath,
                "-map", `0:${visual.index}`, "-map", "1:0",
                "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2",
                "-frames:v", String(need.visual.frameCount),
                "-movflags", "+faststart", output,
              ],
              timeoutMs: processTimeoutMs,
              maxStdoutBytes: 64 * 1024,
            });
            const finalInspection = await outputInspection({
              path: output,
              mediaType: "video/mp4",
              ffprobePath,
              timeoutMs: processTimeoutMs,
              maxProbeOutputBytes,
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
            const artifact = await context.artifacts.put(await readFile(output), "video/mp4");
            const value: MuxedMedia = sealMuxedMedia({
              contract: "svml.muxed-media@1",
              frameRate: need.visual.frameRate,
              frameCount: need.visual.frameCount,
              canvas: need.visual.canvas,
              presentationSampleFrames: need.audio.sampleFrames,
              artifact,
            });
            return result(canonicalize(value), canonicalize({
              provider: "media.local",
              operation: "mux",
              videoStream: finalVideo[0]!.index,
              audioStream: finalAudio[0]!.index,
            }));
          } finally {
            await rm(work, { recursive: true, force: true }).catch(() => {});
          }
        },
      },
    ],
  });
}
