import { sealMediaInspection } from "@hypit/media";
import type { MediaAudioStream, MediaInspection, MediaOtherStream, MediaRational, MediaStream, MediaTimestamp, MediaVideoStream, PictureObservation } from "@hypit/media";
import { ffprobeDisplayRotation } from "./ffprobe-display.js";

type JsonObject = Record<string, unknown>;

type FfprobeStream = {
  readonly index?: unknown;
  readonly codec_type?: unknown;
  readonly codec_name?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly sample_aspect_ratio?: unknown;
  readonly time_base?: unknown;
  readonly avg_frame_rate?: unknown;
  readonly r_frame_rate?: unknown;
  readonly pix_fmt?: unknown;
  readonly bits_per_raw_sample?: unknown;
  readonly color_primaries?: unknown;
  readonly color_transfer?: unknown;
  readonly color_space?: unknown;
  readonly color_range?: unknown;
  readonly sample_rate?: unknown;
  readonly channels?: unknown;
  readonly channel_layout?: unknown;
  readonly disposition?: { readonly default?: unknown; readonly attached_pic?: unknown };
  readonly tags?: { readonly rotate?: unknown };
  readonly side_data_list?: readonly unknown[];
};

type FfprobePixelFormat = {
  readonly name?: unknown;
  readonly flags?: { readonly alpha?: unknown };
  readonly components?: readonly { readonly bit_depth?: unknown }[];
};

type FfprobeFrame = {
  readonly media_type?: unknown;
  readonly stream_index?: unknown;
  readonly pts?: unknown;
  readonly best_effort_timestamp?: unknown;
  readonly duration?: unknown;
  readonly pkt_duration?: unknown;
  readonly nb_samples?: unknown;
};

type TimingState = {
  readonly stream: FfprobeStream;
  readonly kind: "video" | "audio" | "other";
  readonly index: number;
  readonly timeBase: MediaRational | undefined;
  decodedUnitCount: number;
  decodedSampleFrames: number;
  firstPts: bigint | undefined;
  lastEndPts: bigint | undefined;
  complete: boolean;
};

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function integer(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/u.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = integer(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function bigintValue(value: unknown): bigint | undefined {
  if (typeof value === "string" && /^-?\d+$/u.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  return undefined;
}

function rational(value: unknown, allowZero = false): MediaRational | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(-?\d+)\/(\d+)$/u);
  if (match === null) return undefined;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1) return undefined;
  if (allowZero ? numerator < 0 : numerator < 1) return undefined;
  return { numerator, denominator };
}

function divisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function sampleAspectRatio(value: unknown): MediaRational {
  if (typeof value !== "string") return { numerator: 1, denominator: 1 };
  const match = value.match(/^(\d+):(\d+)$/u);
  if (match === null) return { numerator: 1, denominator: 1 };
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)
    || numerator <= 0 || denominator <= 0) return { numerator: 1, denominator: 1 };
  const factor = divisor(numerator, denominator);
  return { numerator: numerator / factor, denominator: denominator / factor };
}

function timestamp(ticks: bigint, timeBase: MediaRational): MediaTimestamp {
  return { ticks: ticks.toString(), timeBase };
}

function pictureObservation(stream: FfprobeStream, formats: readonly FfprobePixelFormat[]): PictureObservation {
  const result: { -readonly [Key in keyof PictureObservation]?: PictureObservation[Key] } = {};
  if (stream.color_primaries === "bt709") result.colorPrimaries = "bt709";
  if (stream.color_transfer === "iec61966-2-1") result.colorTransfer = "srgb";
  else if (stream.color_transfer === "bt709") result.colorTransfer = "bt709";
  if (stream.color_space === "gbr" || stream.color_space === "rgb") result.colorMatrix = "rgb";
  else if (stream.color_space === "bt709") result.colorMatrix = "bt709";
  if (stream.color_range === "pc") result.colorRange = "full";
  else if (stream.color_range === "tv") result.colorRange = "limited";
  const format = typeof stream.pix_fmt === "string"
    ? formats.find((candidate) => candidate.name === stream.pix_fmt) : undefined;
  const rawDepth = positiveInteger(stream.bits_per_raw_sample);
  const componentDepths = [...new Set((format?.components ?? [])
    .map((component) => positiveInteger(component.bit_depth)).filter((value): value is number => value !== undefined))];
  const bitDepth = rawDepth ?? (componentDepths.length === 1 ? componentDepths[0] : undefined);
  if (bitDepth === 8) result.bitDepth = bitDepth;
  if (format !== undefined) result.alphaMode = integer(format.flags?.alpha) === 1 ? "straight" : "opaque";
  return result;
}

function sampleDurationTicks(
  samples: number,
  stream: FfprobeStream,
  timeBase: MediaRational,
): bigint | undefined {
  const sampleRate = positiveInteger(stream.sample_rate);
  if (samples <= 0 || sampleRate === undefined) return undefined;
  const numerator = BigInt(samples) * BigInt(timeBase.denominator);
  const denominator = BigInt(sampleRate) * BigInt(timeBase.numerator);
  if (denominator <= 0n || numerator % denominator !== 0n) return undefined;
  return numerator / denominator;
}

function timingState(
  stream: FfprobeStream,
  kind: "video" | "audio" | "other",
  index: number,
  timeBase: MediaRational | undefined,
): TimingState {
  return {
    stream, kind, index, timeBase,
    decodedUnitCount: 0,
    decodedSampleFrames: 0,
    firstPts: undefined,
    lastEndPts: undefined,
    complete: timeBase !== undefined,
  };
}

function observeFrame(state: TimingState, frame: FfprobeFrame): void {
  if (integer(frame.stream_index) !== state.index
    || (state.kind !== "other" && frame.media_type !== state.kind)) return;
  state.decodedUnitCount += 1;
  const samples = positiveInteger(frame.nb_samples) ?? 0;
  state.decodedSampleFrames += samples;
  if (state.timeBase === undefined) return;
  const pts = bigintValue(frame.pts) ?? bigintValue(frame.best_effort_timestamp);
  const duration = bigintValue(frame.duration) ?? bigintValue(frame.pkt_duration)
    ?? (state.kind === "audio" ? sampleDurationTicks(samples, state.stream, state.timeBase) : undefined);
  if (pts === undefined || duration === undefined || duration <= 0n) {
    state.complete = false;
    return;
  }
  const end = pts + duration;
  if (state.firstPts === undefined || pts < state.firstPts) state.firstPts = pts;
  if (state.lastEndPts === undefined || end > state.lastEndPts) state.lastEndPts = end;
}

function timing(state: TimingState): {
  readonly startPts?: MediaTimestamp;
  readonly endPts?: MediaTimestamp;
  readonly decodedUnitCount: number;
  readonly decodedSampleFrames: number;
} {
  const base = {
    decodedUnitCount: state.decodedUnitCount,
    decodedSampleFrames: state.decodedSampleFrames,
  };
  if (!state.complete || state.decodedUnitCount === 0 || state.timeBase === undefined
    || state.firstPts === undefined || state.lastEndPts === undefined
    || state.lastEndPts <= state.firstPts) return base;
  return {
    startPts: timestamp(state.firstPts, state.timeBase),
    endPts: timestamp(state.lastEndPts, state.timeBase),
    ...base,
  };
}

/** Incrementally collect decoded-unit facts without retaining one object per frame. */
export function createMediaInspectionCollector(value: unknown): {
  readonly observe: (frame: unknown) => void;
  readonly finish: () => MediaInspection;
} {
  const root = object(value);
  if (root === undefined) throw new Error("ffprobe output must be an object");
  const rawStreams = Array.isArray(root.streams) ? root.streams.map(object).filter((item): item is JsonObject => item !== undefined) : [];
  const streams = rawStreams as FfprobeStream[];
  const rawFormats = Array.isArray(root.pixel_formats)
    ? root.pixel_formats.map(object).filter((item): item is JsonObject => item !== undefined) : [];
  const formats = rawFormats as FfprobePixelFormat[];
  const states = streams.map((stream) => {
    const index = integer(stream.index);
    if (index === undefined || index < 0) throw new Error("ffprobe stream index is invalid");
    const codecType = typeof stream.codec_type === "string" && stream.codec_type.length > 0 ? stream.codec_type : "unknown";
    const kind = codecType === "video" || codecType === "audio" ? codecType : "other";
    return timingState(stream, kind, index, rational(stream.time_base));
  });
  const stateByIndex = new Map(states.map((state) => [state.index, state]));
  return {
    observe(value: unknown): void {
      const frame = object(value) as FfprobeFrame | undefined;
      const index = frame === undefined ? undefined : integer(frame.stream_index);
      if (frame !== undefined && index !== undefined) {
        const state = stateByIndex.get(index);
        if (state !== undefined) observeFrame(state, frame);
      }
    },
    finish(): MediaInspection {
      const parsed: MediaStream[] = states.map((state): MediaStream => {
    const { stream, index } = state;
    const codecType = typeof stream.codec_type === "string" && stream.codec_type.length > 0 ? stream.codec_type : "unknown";
    const codecName = typeof stream.codec_name === "string" && stream.codec_name.length > 0 ? stream.codec_name : "unknown";
    const disposition = {
      default: integer(stream.disposition?.default) === 1,
      attachedPicture: integer(stream.disposition?.attached_pic) === 1,
    };
    if (codecType === "video") {
      const measured = timing(state);
      const width = positiveInteger(stream.width);
      const height = positiveInteger(stream.height);
      if (width === undefined || height === undefined) throw new Error(`video stream ${index} dimensions are invalid`);
      return {
        kind: "video",
        index,
        codecName,
        disposition,
        ...(measured.startPts === undefined ? {} : { startPts: measured.startPts, endPts: measured.endPts! }),
        decodedUnitCount: measured.decodedUnitCount,
        width,
        height,
        sampleAspectRatio: sampleAspectRatio(stream.sample_aspect_ratio),
        rotationDegrees: ffprobeDisplayRotation(stream, `video stream ${index}`),
        picture: pictureObservation(stream, formats),
        ...(rational(stream.avg_frame_rate, true) === undefined ? {} : { averageFrameRate: rational(stream.avg_frame_rate, true)! }),
      };
    }
    if (codecType === "audio") {
      const measured = timing(state);
      const sampleRate = positiveInteger(stream.sample_rate);
      const channels = positiveInteger(stream.channels);
      if (sampleRate === undefined || channels === undefined) throw new Error(`audio stream ${index} shape is invalid`);
      const result: MediaAudioStream = {
        kind: "audio",
        index,
        codecName,
        disposition,
        ...(measured.startPts === undefined ? {} : { startPts: measured.startPts, endPts: measured.endPts! }),
        sampleRate,
        channels,
        decodedSampleFrames: measured.decodedSampleFrames,
      };
      return result;
    }
    const measured = timing(state);
    const result: MediaOtherStream = {
      kind: "other",
      index,
      codecType,
      codecName,
      disposition,
      ...(measured.startPts === undefined ? {} : { startPts: measured.startPts, endPts: measured.endPts! }),
    };
    return result;
      });
      return sealMediaInspection({
        streams: parsed.sort((left, right) => left.index - right.index),
      });
    },
  };
}

export function parseMediaInspection(value: unknown): MediaInspection {
  const root = object(value);
  if (root === undefined) throw new Error("ffprobe output must be an object");
  const collector = createMediaInspectionCollector(root);
  const frames = Array.isArray(root.frames) ? root.frames : [];
  for (const frame of frames) collector.observe(frame);
  return collector.finish();
}
