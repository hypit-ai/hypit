import { link, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import {
  audioViewDimensions,
  composeAudioObservation,
  inspectAudio,
  roundMediaSeconds,
  selectAudioStream,
} from "./audio-view.js";
import type { AudioInspection, AudioOverlay, ObservationMarker } from "./audio-view.js";
import { runBoundedMediaProcess } from "./process.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export type SpectrogramScale = "linear" | "sqrt" | "cbrt" | "log";
export type FrequencyScale = "linear" | "log";

export type SpectrogramOptions = {
  readonly start?: number;
  readonly end?: number;
  readonly audioStream?: number;
  readonly width?: number;
  readonly height?: number;
  readonly splitChannels?: boolean;
  readonly scale?: SpectrogramScale;
  readonly frequencyScale?: FrequencyScale;
  readonly startFrequency?: number;
  readonly stopFrequency?: number;
  readonly dynamicRange?: number;
};

export type SpectrogramViewOptions = SpectrogramOptions & {
  readonly markers?: readonly (number | ObservationMarker)[];
  readonly markerColor?: string;
  readonly showTime?: boolean;
};

function ffmpegScale(scale: SpectrogramScale | FrequencyScale): string {
  return scale === "linear" ? "lin" : scale;
}

function frequencyRange(
  stream: { readonly sampleRate?: number },
  options: SpectrogramOptions,
): { readonly start: number; readonly stop: number } {
  const nyquist = (stream.sampleRate ?? 48_000) / 2;
  const start = options.startFrequency ?? 0;
  const stop = options.stopFrequency ?? nyquist;
  assert(Number.isFinite(start) && start >= 0, `spectrogram start frequency must be non-negative, got ${start}`);
  assert(Number.isFinite(stop) && stop > start && stop <= nyquist,
    `spectrogram stop frequency must be greater than ${start} and at most the ${nyquist} Hz Nyquist frequency, got ${stop}`);
  return { start, stop };
}

function dynamicRange(options: SpectrogramOptions): number {
  const value = options.dynamicRange ?? 100;
  assert(Number.isFinite(value) && value >= 10 && value <= 200,
    `spectrogram dynamic range must be from 10 to 200 dB, got ${value}`);
  return value;
}

async function renderInspectedSpectrogram(
  path: string,
  inspection: AudioInspection,
  options: SpectrogramOptions,
): Promise<{ readonly image: Buffer; readonly stream: AudioInspection["streams"][number]; readonly width: number; readonly height: number;
  readonly start: number; readonly end: number; readonly frequencyStart: number; readonly frequencyStop: number }> {
  const stream = selectAudioStream(path, inspection.streams, options.audioStream);
  const start = options.start ?? 0;
  const end = options.end ?? inspection.duration;
  assert(Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start && end <= inspection.duration + 0.001,
    `spectrogram range must satisfy 0 <= start < end <= ${inspection.duration} s`);
  const { width, height } = audioViewDimensions(options, stream, { width: 2048, height: 256, splitChannelHeight: 128 });
  const frequencies = frequencyRange(stream, options);
  const filter = [
    "aresample=async=1:first_pts=0",
    "apad",
    `atrim=start=${roundMediaSeconds(start)}:end=${roundMediaSeconds(end)}`,
    "asetpts=PTS-STARTPTS",
    `showspectrumpic=s=${width}x${height}:mode=${options.splitChannels ? "separate" : "combined"}`
      + `:color=cividis:scale=${ffmpegScale(options.scale ?? "log")}:fscale=${ffmpegScale(options.frequencyScale ?? "log")}`
      + `:legend=0:start=${frequencies.start}:stop=${frequencies.stop}:drange=${dynamicRange(options)}`,
  ].join(",");
  const image = Buffer.from(await runBoundedMediaProcess({
    executable: "ffmpeg",
    argv: [
      "-hide_banner", "-loglevel", "error", "-threads", "1", "-i", path,
      "-filter_complex_threads", "1", "-filter_complex", `[0:${stream.index}]${filter}`,
      "-frames:v", "1", "-an", "-f", "image2pipe", "-vcodec", "png", "pipe:1",
    ],
    timeoutMs: 300_000,
    maxStdoutBytes: Math.max(1024 * 1024, width * height * 4 + 1024 * 1024),
  }));
  return { image, stream, width, height, start, end, frequencyStart: frequencies.start, frequencyStop: frequencies.stop };
}

function frequencyLabel(value: number): string {
  if (value >= 1000) return `${Number((value / 1000).toFixed(value >= 10_000 ? 0 : 1))} kHz`;
  return `${Math.round(value)} Hz`;
}

function frequencyOverlays(
  width: number, height: number, start: number, stop: number, channels: number,
): readonly AudioOverlay[] {
  const label = (text: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="18">
    <rect width="72" height="18" rx="2" fill="#0c0c0c" fill-opacity="0.78"/>
    <text x="5" y="13" font-family="sans-serif" font-size="11" fill="#e2e2e2">${text}</text>
  </svg>`);
  const laneHeight = height / channels;
  return Array.from({ length: channels }, (_, index) => {
    const laneTop = index * laneHeight;
    return [
      { input: label(frequencyLabel(stop)), left: Math.max(0, width - 75), top: Math.round(laneTop + 3) },
      { input: label(frequencyLabel(start)), left: Math.max(0, width - 75),
        top: Math.max(0, Math.round(laneTop + laneHeight - 21)) },
    ];
  }).flat();
}

export async function renderSpectrogram(path: string, options: SpectrogramOptions = {}): Promise<Buffer> {
  return (await renderInspectedSpectrogram(path, await inspectAudio(path), options)).image;
}

/** Add source-time, frame markers and frequency endpoints without changing spectrogram evidence. */
export async function renderSpectrogramView(
  path: string,
  options: SpectrogramViewOptions = {},
): Promise<Buffer> {
  const rendered = await renderInspectedSpectrogram(path, await inspectAudio(path), options);
  return composeAudioObservation(
    rendered.image,
    rendered.stream,
    { start: rendered.start, end: rendered.end },
    { width: rendered.width, height: rendered.height },
    {
      markers: (options.markers ?? []).map((marker) => typeof marker === "number" ? { at: marker } : marker),
      ...(options.markerColor === undefined ? {} : { markerColor: options.markerColor }),
      ...(options.showTime === undefined ? {} : { showTime: options.showTime }),
      ...(options.splitChannels === undefined ? {} : { splitChannels: options.splitChannels }),
      overlays: frequencyOverlays(rendered.width, rendered.height, rendered.frequencyStart, rendered.frequencyStop,
        options.splitChannels ? (rendered.stream.channels ?? 1) : 1),
    },
  );
}

/** Write a complete spectrogram view without replacing an existing destination. */
export async function writeSpectrogram(path: string, target: string, options: SpectrogramViewOptions = {}): Promise<void> {
  assert(extname(target).toLowerCase() === ".png", "spectrogram --to must end in .png");
  const directory = await mkdtemp(join(dirname(target), ".hypit-spectrogram-"));
  const staged = join(directory, "spectrogram.png");
  try {
    await writeFile(staged, await renderSpectrogramView(path, options));
    await link(staged, target);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
