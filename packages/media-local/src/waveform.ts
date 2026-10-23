import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import {
  audioViewDimensions,
  composeAudioObservation,
  inspectAudio,
  roundMediaSeconds,
  selectAudioStream,
} from "./audio-view.js";
import type { AudioInspection, ObservationMarker } from "./audio-view.js";
import { runBoundedMediaProcess } from "./process.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export { inspectAudio, selectAudioStream } from "./audio-view.js";
export type { AudioInspection, AudioStream, ObservationMarker } from "./audio-view.js";

export type WaveformScale = "linear" | "sqrt" | "cbrt" | "log";
export type WaveformFilter = "peak" | "average";

export type WaveformOptions = {
  readonly start?: number;
  readonly end?: number;
  readonly audioStream?: number;
  readonly width?: number;
  readonly height?: number;
  readonly splitChannels?: boolean;
  readonly scale?: WaveformScale;
  readonly filter?: WaveformFilter;
};

export type WaveformViewOptions = WaveformOptions & {
  readonly markers?: readonly (number | ObservationMarker)[];
  readonly markerColor?: string;
  readonly showTime?: boolean;
};

function scaleName(scale: WaveformScale): string {
  return scale === "linear" ? "lin" : scale;
}

/**
 * Render one audio stream over an explicit interval on the source media clock.
 *
 * `aresample:first_pts=0` preserves a delayed stream as leading silence; `apad` preserves trailing
 * absence. The interval is therefore not rebased to the first audible sample.
 */
async function renderInspectedWaveform(
  path: string,
  inspection: AudioInspection,
  options: WaveformOptions,
): Promise<Buffer> {
  const stream = selectAudioStream(path, inspection.streams, options.audioStream);
  const start = options.start ?? 0;
  const end = options.end ?? inspection.duration;
  assert(Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start && end <= inspection.duration + 0.001,
    `waveform range must satisfy 0 <= start < end <= ${inspection.duration} s`);
  const { width, height } = audioViewDimensions(options, stream, { width: 2048, height: 96, splitChannelHeight: 48 });
  const filter = [
    "aresample=async=1:first_pts=0",
    "apad",
    `atrim=start=${roundMediaSeconds(start)}:end=${roundMediaSeconds(end)}`,
    "asetpts=PTS-STARTPTS",
    `showwavespic=s=${width}x${height}:colors=white:scale=${scaleName(options.scale ?? "linear")}:filter=${options.filter ?? "peak"}:split_channels=${options.splitChannels ? 1 : 0}`,
  ].join(",");
  return Buffer.from(await runBoundedMediaProcess({
    executable: "ffmpeg",
    argv: [
      "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", path,
      "-filter_complex_threads", "1", "-filter_complex", `[0:${stream.index}]${filter}`,
      "-frames:v", "1", "-an", "-f", "image2pipe", "-vcodec", "png", "pipe:1",
    ],
    timeoutMs: 300_000,
    maxStdoutBytes: Math.max(1024 * 1024, width * height * 4 + 1024 * 1024),
  }));
}

export async function renderWaveform(path: string, options: WaveformOptions = {}): Promise<Buffer> {
  return renderInspectedWaveform(path, await inspectAudio(path), options);
}

/** Add source-clock endpoints and optional observation markers without changing the waveform data. */
export async function renderWaveformView(
  path: string,
  options: WaveformViewOptions = {},
): Promise<Buffer> {
  const inspection = await inspectAudio(path);
  const stream = selectAudioStream(path, inspection.streams, options.audioStream);
  const start = options.start ?? 0;
  const end = options.end ?? inspection.duration;
  const { width, height } = audioViewDimensions(options, stream, { width: 2048, height: 96, splitChannelHeight: 48 });
  const waveform = await renderInspectedWaveform(path, inspection, { ...options, start, end, width, height });
  return composeAudioObservation(waveform, stream, { start, end }, { width, height }, {
    markers: (options.markers ?? []).map((marker) => typeof marker === "number" ? { at: marker } : marker),
    ...(options.markerColor === undefined ? {} : { markerColor: options.markerColor }),
    ...(options.showTime === undefined ? {} : { showTime: options.showTime }),
    ...(options.splitChannels === undefined ? {} : { splitChannels: options.splitChannels }),
  });
}

/** Write a complete waveform view without replacing an existing destination. */
export async function writeWaveform(path: string, target: string, options: WaveformViewOptions = {}): Promise<void> {
  assert(extname(target).toLowerCase() === ".png", "waveform --to must end in .png");
  const directory = await mkdtemp(join(dirname(target), ".hypit-waveform-"));
  const staged = join(directory, "waveform.png");
  try {
    await writeFile(staged, await renderWaveformView(path, options));
    await link(staged, target);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
