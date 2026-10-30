import { sealMediaInspection } from "@hypit/media";
import type { MediaAudioStream, MediaInspection, MediaOtherStream, MediaRational, MediaStream, MediaTimestamp, MediaVideoStream, PictureObservation, VideoFrameIndex } from "@hypit/media";
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
  readonly tags?: Readonly<Record<string, unknown>>;
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

type Unit = { pts: bigint; duration: bigint | undefined; samples: number };

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
  else if (stream.color_primaries === "smpte432") result.colorPrimaries = "display-p3";
  else if (stream.color_primaries === "bt2020") result.colorPrimaries = "bt2020";
  if (stream.color_transfer === "iec61966-2-1") result.colorTransfer = "srgb";
  else if (stream.color_transfer === "bt709") result.colorTransfer = "bt709";
  else if (stream.color_transfer === "linear") result.colorTransfer = "linear";
  else if (stream.color_transfer === "smpte2084") result.colorTransfer = "pq";
  else if (stream.color_transfer === "arib-std-b67") result.colorTransfer = "hlg";
  if (stream.color_space === "gbr" || stream.color_space === "rgb") result.colorMatrix = "rgb";
  else if (stream.color_space === "bt709") result.colorMatrix = "bt709";
  else if (stream.color_space === "bt2020nc") result.colorMatrix = "bt2020-ncl";
  if (stream.color_range === "pc") result.colorRange = "full";
  else if (stream.color_range === "tv") result.colorRange = "limited";
  const format = typeof stream.pix_fmt === "string"
    ? formats.find((candidate) => candidate.name === stream.pix_fmt) : undefined;
  const rawDepth = positiveInteger(stream.bits_per_raw_sample);
  const componentDepths = [...new Set((format?.components ?? [])
    .map((component) => positiveInteger(component.bit_depth)).filter((value): value is number => value !== undefined))];
  const bitDepth = rawDepth ?? (componentDepths.length === 1 ? componentDepths[0] : undefined);
  if (bitDepth === 8 || bitDepth === 10 || bitDepth === 12 || bitDepth === 16) result.bitDepth = bitDepth;
  const alphaTag = Object.entries(stream.tags ?? {}).find(([key]) => key.toLowerCase() === "alpha_mode")?.[1];
  if (integer(alphaTag) === 1 || integer(format?.flags?.alpha) === 1) result.alphaMode = "straight";
  else if (format !== undefined) result.alphaMode = "opaque";
  return result;
}

function median(values: readonly bigint[]): bigint {
  const ordered = [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  return ordered[Math.floor((ordered.length - 1) / 2)]!;
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
  if (denominator <= 0n) return undefined;
  return (numerator + denominator / 2n) / denominator;
}

function timing(
  frames: readonly FfprobeFrame[],
  stream: FfprobeStream,
  kind: "video" | "audio" | "other",
  index: number,
  timeBase: MediaRational | undefined,
): {
  readonly timingStatus: MediaStream["timingStatus"];
  readonly startPts?: MediaTimestamp;
  readonly endPts?: MediaTimestamp;
  readonly decodedUnitCount: number;
  readonly decodedSampleFrames: number;
  readonly frameIndex?: VideoFrameIndex;
} {
  if (timeBase === undefined) return { timingStatus: "missing", decodedUnitCount: 0, decodedSampleFrames: 0 };
  const selected = frames.filter((frame) => integer(frame.stream_index) === index
    && (kind === "other" || frame.media_type === kind));
  const units: Unit[] = [];
  for (const frame of selected) {
    const pts = bigintValue(frame.pts) ?? bigintValue(frame.best_effort_timestamp);
    if (pts === undefined) return { timingStatus: "missing", decodedUnitCount: selected.length, decodedSampleFrames: 0 };
    const samples = positiveInteger(frame.nb_samples) ?? 0;
    units.push({
      pts,
      duration: bigintValue(frame.duration) ?? bigintValue(frame.pkt_duration)
        ?? (kind === "audio" ? sampleDurationTicks(samples, stream, timeBase) : undefined),
      samples,
    });
  }
  if (units.length === 0) return { timingStatus: "missing", decodedUnitCount: 0, decodedSampleFrames: 0 };
  const deltas: bigint[] = [];
  for (let offset = 1; offset < units.length; offset += 1) {
    const delta = units[offset]!.pts - units[offset - 1]!.pts;
    if (delta <= 0n) {
      return {
        timingStatus: "non-monotonic",
        decodedUnitCount: units.length,
        decodedSampleFrames: units.reduce((sum, unit) => sum + unit.samples, 0),
      };
    }
    deltas.push(delta);
  }
  for (let offset = 0; offset < units.length - 1; offset += 1) {
    if (units[offset]!.duration === undefined || units[offset]!.duration! <= 0n) {
      units[offset]!.duration = units[offset + 1]!.pts - units[offset]!.pts;
    }
  }
  const last = units.at(-1)!;
  if (last.duration === undefined || last.duration <= 0n) {
    last.duration = deltas.at(-1);
  }
  if (last.duration === undefined || last.duration <= 0n) {
    return {
      timingStatus: "missing",
      decodedUnitCount: units.length,
      decodedSampleFrames: units.reduce((sum, unit) => sum + unit.samples, 0),
    };
  }
  if (kind === "audio") {
    for (let offset = 0; offset < units.length - 1; offset += 1) {
      const gap = units[offset + 1]!.pts - (units[offset]!.pts + units[offset]!.duration!);
      if (gap > 2n || gap < -2n) {
        return {
          timingStatus: gap > 0n ? "discontinuous" : "non-monotonic",
          decodedUnitCount: units.length,
          decodedSampleFrames: units.reduce((sum, unit) => sum + unit.samples, 0),
        };
      }
    }
  } else if (kind === "video" && deltas.length >= 2) {
    const cadence = median(deltas);
    const halfSecondTicks = (BigInt(timeBase.denominator) + 2n * BigInt(timeBase.numerator) - 1n)
      / (2n * BigInt(timeBase.numerator));
    const threshold = cadence * 4n > halfSecondTicks ? cadence * 4n : halfSecondTicks;
    if (deltas.some((delta) => delta > threshold)) {
      return {
        timingStatus: "discontinuous",
        decodedUnitCount: units.length,
        decodedSampleFrames: 0,
      };
    }
  }
  return {
    timingStatus: "admissible",
    ...(kind === "video" ? { frameIndex: { timeBase, timestamps: units.map(unit => String(unit.pts)),
      endTimestamp: String(last.pts + last.duration) } } : {}),
    startPts: timestamp(units[0]!.pts, timeBase),
    endPts: timestamp(last.pts + last.duration, timeBase),
    decodedUnitCount: units.length,
    decodedSampleFrames: units.reduce((sum, unit) => sum + unit.samples, 0),
  };
}

export function parseMediaInspection(value: unknown): MediaInspection {
  const root = object(value);
  if (root === undefined) throw new Error("ffprobe output must be an object");
  const rawStreams = Array.isArray(root.streams) ? root.streams.map(object).filter((item): item is JsonObject => item !== undefined) : [];
  const streams = rawStreams as FfprobeStream[];
  const rawFrames = Array.isArray(root.frames) ? root.frames.map(object).filter((item): item is JsonObject => item !== undefined) : [];
  const frames = rawFrames as FfprobeFrame[];
  const rawFormats = Array.isArray(root.pixel_formats)
    ? root.pixel_formats.map(object).filter((item): item is JsonObject => item !== undefined) : [];
  const formats = rawFormats as FfprobePixelFormat[];
  const parsed: MediaStream[] = streams.map((stream): MediaStream => {
    const index = integer(stream.index);
    if (index === undefined || index < 0) throw new Error("ffprobe stream index is invalid");
    const codecType = typeof stream.codec_type === "string" && stream.codec_type.length > 0 ? stream.codec_type : "unknown";
    const codecName = typeof stream.codec_name === "string" && stream.codec_name.length > 0 ? stream.codec_name : "unknown";
    const timeBase = rational(stream.time_base);
    const disposition = {
      default: integer(stream.disposition?.default) === 1,
      attachedPicture: integer(stream.disposition?.attached_pic) === 1,
    };
    if (codecType === "video") {
      const measured = timing(frames, stream, "video", index, timeBase);
      const width = positiveInteger(stream.width);
      const height = positiveInteger(stream.height);
      if (width === undefined || height === undefined) throw new Error(`video stream ${index} dimensions are invalid`);
      const role: MediaVideoStream["role"] = disposition.attachedPicture
        ? "attached-picture"
        : measured.decodedUnitCount >= 2 ? "moving" : "still";
      return {
        kind: "video",
        index,
        codecType: "video",
        codecName,
        disposition,
        timingStatus: measured.timingStatus,
        ...(timeBase === undefined ? {} : { timeBase }),
        ...(measured.startPts === undefined ? {} : { startPts: measured.startPts, endPts: measured.endPts! }),
        decodedUnitCount: measured.decodedUnitCount,
        role,
        width,
        height,
        sampleAspectRatio: sampleAspectRatio(stream.sample_aspect_ratio),
        rotationDegrees: ffprobeDisplayRotation(stream, `video stream ${index}`),
        picture: pictureObservation(stream, formats),
        ...(measured.frameIndex === undefined ? {} : { frameIndex: measured.frameIndex }),
        ...(rational(stream.avg_frame_rate, true) === undefined ? {} : { averageFrameRate: rational(stream.avg_frame_rate, true)! }),
        ...(rational(stream.r_frame_rate, true) === undefined ? {} : { nominalFrameRate: rational(stream.r_frame_rate, true)! }),
      };
    }
    if (codecType === "audio") {
      const measured = timing(frames, stream, "audio", index, timeBase);
      const sampleRate = positiveInteger(stream.sample_rate);
      const channels = positiveInteger(stream.channels);
      if (sampleRate === undefined || channels === undefined) throw new Error(`audio stream ${index} shape is invalid`);
      const result: MediaAudioStream = {
        kind: "audio",
        index,
        codecType: "audio",
        codecName,
        disposition,
        timingStatus: measured.timingStatus,
        ...(timeBase === undefined ? {} : { timeBase }),
        ...(measured.startPts === undefined ? {} : { startPts: measured.startPts, endPts: measured.endPts! }),
        decodedUnitCount: measured.decodedUnitCount,
        sampleRate,
        channels,
        ...(typeof stream.channel_layout === "string" && stream.channel_layout.length > 0
          ? { channelLayout: stream.channel_layout }
          : {}),
        decodedSampleFrames: measured.decodedSampleFrames,
      };
      return result;
    }
    const measured = timing(frames, stream, "other", index, timeBase);
    const result: MediaOtherStream = {
      kind: "other",
      index,
      codecType,
      codecName,
      disposition,
      timingStatus: measured.timingStatus,
      ...(timeBase === undefined ? {} : { timeBase }),
      ...(measured.startPts === undefined ? {} : { startPts: measured.startPts, endPts: measured.endPts! }),
      decodedUnitCount: measured.decodedUnitCount,
    };
    return result;
  });
  const format = object(root.format);
  const formatNames = typeof format?.format_name === "string"
    ? [...new Set(format.format_name.split(",").map((item) => item.trim()).filter(Boolean))].sort()
    : ["unknown"];
  return sealMediaInspection({
    container: { formatNames: formatNames.length === 0 ? ["unknown"] : formatNames },
    streams: parsed.sort((left, right) => left.index - right.index),
  });
}
