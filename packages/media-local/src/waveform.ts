import type { MediaAudioPeaks } from "@hypit/media";
import { runMediaProcessLines } from "./process.js";

export function peakWaveformFilter(width: number, height: number): string {
  if (!Number.isSafeInteger(width) || width < 16 || width > 2048) {
    throw new Error("Waveform width must be an integer from 16 through 2048.");
  }
  if (!Number.isSafeInteger(height) || height < 16 || height > 512) {
    throw new Error("Waveform height must be an integer from 16 through 512.");
  }
  return `showwavespic=s=${width}x${height}:colors=white:filter=peak`;
}
/** Measure PCM after the caller's source selection or mix on its requested sample grid. */
export async function readWaveformPeaks(input: {
  readonly executable: string;
  readonly signal: AbortSignal;
  readonly sampleRate: number;
  readonly sampleCount: number;
  readonly samplesPerPeak: number;
  readonly argumentsForFilter: (filter: string) => readonly string[];
}): Promise<MediaAudioPeaks> {
  const { sampleRate, sampleCount, samplesPerPeak } = input;
  const frameSamples = Math.min(samplesPerPeak, 65_536, sampleCount);
  const frameCount = Math.ceil(sampleCount / frameSamples);
  const peaks = new Array<number>(Math.ceil(sampleCount / samplesPerPeak)).fill(0);
  let frame = 0;
  const key = "lavfi.astats.Overall.Peak_level=";
  const filter = [
    `asetnsamples=n=${frameSamples}:p=0`,
    "astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=Peak_level",
    "ametadata=mode=print:key=lavfi.astats.Overall.Peak_level:file='pipe\\:1'",
  ].join(",");
  await runMediaProcessLines({
    executable: input.executable, signal: input.signal, argv: input.argumentsForFilter(filter),
    timeoutMs: 120_000,
    maxLineBytes: 256,
    onLine(line) {
      if (!line.startsWith(key)) return;
      const level = line.slice(key.length);
      const decibels = level === "-inf" ? -Infinity : Number(level);
      if (Number.isNaN(decibels) || frame >= frameCount) throw new Error("Invalid PCM peak.");
      const bucket = Math.floor(frame++ * frameSamples / samplesPerPeak);
      peaks[bucket] = Math.max(peaks[bucket]!, Math.min(1, 10 ** (decibels / 20)));
    },
  });
  if (frame !== frameCount) throw new Error("PCM peaks did not cover the selected clock.");
  return { sampleRate, sampleCount, samplesPerPeak, peaks };
}
