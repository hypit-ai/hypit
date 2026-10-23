import sharp from "sharp";

import { runProcess } from "./process.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function roundMediaSeconds(value: number): number { return Number(value.toFixed(3)); }

export type AudioStream = {
  /** The actual container stream index accepted by ffmpeg's `0:<index>` selector. */
  readonly index: number;
  readonly channels?: number;
  readonly channelLayout?: string;
  readonly sampleRate?: number;
};

export type AudioInspection = {
  readonly duration: number;
  readonly streams: readonly AudioStream[];
};

/** Inspect only source-clock and stream facts required by local audio observations. */
export async function inspectAudio(path: string): Promise<AudioInspection> {
  const bytes = await runProcess("ffprobe", [
    "-v", "error", "-show_entries", "format=duration:stream=index,codec_type,channels,channel_layout,sample_rate", "-of", "json", path,
  ]);
  const value = JSON.parse(bytes.toString("utf8")) as {
    readonly format?: { readonly duration?: string };
    readonly streams?: readonly {
      readonly index?: number;
      readonly codec_type?: string;
      readonly channels?: number;
      readonly channel_layout?: string;
      readonly sample_rate?: string;
    }[];
  };
  const duration = Number(value.format?.duration);
  assert(Number.isFinite(duration) && duration > 0, `${path}: duration is unavailable`);
  const streams = (value.streams ?? []).flatMap((stream) => stream.codec_type === "audio"
    && Number.isSafeInteger(stream.index)
    ? [{
      index: stream.index!,
      ...(stream.channels === undefined ? {} : { channels: stream.channels }),
      ...(stream.channel_layout === undefined ? {} : { channelLayout: stream.channel_layout }),
      ...(stream.sample_rate === undefined || !Number.isFinite(Number(stream.sample_rate))
        ? {} : { sampleRate: Number(stream.sample_rate) }),
    }]
    : []);
  return { duration: roundMediaSeconds(duration), streams };
}

/** Resolve ambiguity at the file boundary instead of treating the first audio stream as authoritative. */
export function selectAudioStream(
  path: string,
  streams: readonly AudioStream[],
  requested?: number,
): AudioStream {
  assert(streams.length > 0, `${path}: no audio stream`);
  if (requested !== undefined) {
    const selected = streams.find((stream) => stream.index === requested);
    assert(selected !== undefined,
      `${path}: audio stream ${requested} does not exist; available audio stream indexes: ${streams.map((stream) => stream.index).join(", ")}`);
    return selected;
  }
  assert(streams.length === 1,
    `${path}: multiple audio streams (${streams.map((stream) => stream.index).join(", ")}); choose --audio-stream <index>`);
  return streams[0]!;
}

export function audioViewDimensions(
  options: { readonly width?: number; readonly height?: number; readonly splitChannels?: boolean },
  stream: AudioStream,
  defaults: { readonly width: number; readonly height: number; readonly splitChannelHeight: number },
): { readonly width: number; readonly height: number } {
  const width = options.width ?? defaults.width;
  const channels = options.splitChannels ? (stream.channels ?? 1) : 1;
  const height = options.height ?? Math.max(defaults.height, channels * defaults.splitChannelHeight);
  assert(Number.isSafeInteger(width) && width >= 64 && width <= 16_384,
    `audio view width must be a whole number from 64 to 16384, got ${width}`);
  assert(Number.isSafeInteger(height) && height >= 24 && height <= 4_096,
    `audio view height must be a whole number from 24 to 4096, got ${height}`);
  return { width, height };
}

export function timeLabel(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1_000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const wholeSeconds = Math.floor(milliseconds / 1_000) % 60;
  const remainder = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function pleasantStep(target: number): number {
  const power = 10 ** Math.floor(Math.log10(target));
  const unit = target / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/** Render an adaptive source-time axis. Tick density follows the available pixels, not a CLI theme. */
export async function renderTimeAxis(width: number, start: number, end: number): Promise<Buffer> {
  const stackedEndpoints = width < 220;
  const height = stackedEndpoints ? 48 : 30;
  const targetTicks = Math.max(1, Math.floor(width / 140));
  const step = pleasantStep((end - start) / targetTicks);
  const ticks: number[] = [];
  const first = Math.ceil(start / step) * step;
  for (let at = first; at < end - step * 0.05; at += step) {
    if (at > start + step * 0.05) ticks.push(at);
  }
  const intermediate = ticks.map((at) => {
    const x = (at - start) / (end - start) * (width - 1);
    return `<line x1="${x}" y1="0" x2="${x}" y2="6" stroke="#6f6f6f"/>`
      + `<text x="${x}" y="22" text-anchor="middle">${xml(timeLabel(at))}</text>`;
  }).join("");
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#0c0c0c"/>
    <g font-family="sans-serif" font-size="12" fill="#c8c8c8">
      <line x1="0" y1="0" x2="0" y2="7" stroke="#8a8a8a"/>
      <line x1="${width - 1}" y1="0" x2="${width - 1}" y2="7" stroke="#8a8a8a"/>
      ${intermediate}
      <text x="4" y="22" text-anchor="start">${xml(timeLabel(start))}</text>
      <text x="${width - 4}" y="${stackedEndpoints ? 42 : 22}" text-anchor="end">${xml(timeLabel(end))}</text>
    </g>
  </svg>`);
  return sharp(svg).png().toBuffer();
}

export type ObservationMarker = { readonly at: number; readonly label?: string };
export type AudioOverlay = {
  readonly input: Buffer | {
    readonly create: { readonly width: number; readonly height: number; readonly channels: 3; readonly background: string };
  };
  readonly left: number;
  readonly top: number;
};

function markerEntries(
  markers: readonly ObservationMarker[], start: number, end: number, width: number, height: number, color: string,
): AudioOverlay[] {
  const lineWidth = Math.max(1, Math.min(3, Math.round(width / 800)));
  return markers.filter((marker) => marker.at >= start && marker.at <= end).flatMap((marker) => {
    const center = Math.min(width - 1, Math.max(0, Math.round((marker.at - start) / (end - start) * (width - 1))));
    const left = Math.min(width - lineWidth, Math.max(0, center - Math.floor(lineWidth / 2)));
    const line: AudioOverlay = {
      input: { create: { width: lineWidth, height, channels: 3 as const, background: color } }, left, top: 0,
    };
    if (marker.label === undefined) return [line];
    const badge = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="18">
      <rect width="28" height="18" rx="3" fill="#0c0c0c" fill-opacity="0.82" stroke="${xml(color)}"/>
      <text x="14" y="13" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="${xml(color)}">${xml(marker.label)}</text>
    </svg>`);
    return [line, { input: badge, left: Math.min(width - 28, Math.max(0, center - 14)), top: 2 }];
  });
}

function channelNames(stream: AudioStream): readonly string[] {
  const known: Record<string, readonly string[]> = {
    mono: ["M"], stereo: ["FL", "FR"], "2.1": ["FL", "FR", "LFE"],
    "3.0": ["FL", "FR", "FC"], "4.0": ["FL", "FR", "FC", "BC"],
    "5.0": ["FL", "FR", "FC", "BL", "BR"], "5.0(side)": ["FL", "FR", "FC", "SL", "SR"],
    "5.1": ["FL", "FR", "FC", "LFE", "BL", "BR"],
    "5.1(side)": ["FL", "FR", "FC", "LFE", "SL", "SR"],
    "7.1": ["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"],
  };
  const channels = stream.channels ?? 1;
  const names = stream.channelLayout === undefined ? undefined : known[stream.channelLayout];
  return names?.length === channels ? names : Array.from({ length: channels }, (_, index) => `CH ${index + 1}`);
}

function channelEntries(stream: AudioStream, height: number): AudioOverlay[] {
  const names = channelNames(stream);
  if (names.length <= 1) return [];
  const lane = height / names.length;
  return names.map((name, index) => ({
    input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="54" height="18">
      <rect width="54" height="18" rx="2" fill="#0c0c0c" fill-opacity="0.78"/>
      <text x="5" y="13" font-family="sans-serif" font-size="11" fill="#d8d8d8">${xml(name)}</text>
    </svg>`),
    left: 3,
    top: Math.min(height - 18, Math.max(0, Math.round(index * lane + 3))),
  }));
}

/** Add only shared source-time, marker and channel relationships around an independently rendered observation. */
export async function composeAudioObservation(
  observation: Buffer,
  stream: AudioStream,
  range: { readonly start: number; readonly end: number },
  dimensions: { readonly width: number; readonly height: number },
  options: {
    readonly markers?: readonly ObservationMarker[];
    readonly markerColor?: string;
    readonly showTime?: boolean;
    readonly splitChannels?: boolean;
    readonly overlays?: readonly AudioOverlay[];
  } = {},
): Promise<Buffer> {
  const markerColor = options.markerColor ?? "#ffdc80";
  const content = await sharp({ create: {
    width: dimensions.width, height: dimensions.height, channels: 3, background: "#0c0c0c",
  } }).composite([
    { input: observation, left: 0, top: 0 },
    ...markerEntries(options.markers ?? [], range.start, range.end, dimensions.width, dimensions.height, markerColor),
    ...(options.splitChannels ? channelEntries(stream, dimensions.height) : []),
    ...(options.overlays ?? []),
  ]).png().toBuffer();
  if (options.showTime === false) return content;
  const axis = await renderTimeAxis(dimensions.width, range.start, range.end);
  return sharp(content).extend({ bottom: (await sharp(axis).metadata()).height!, background: "#0c0c0c" })
    .composite([{ input: axis, left: 0, top: dimensions.height }]).png().toBuffer();
}
