import type { ExactTemporalValue, TemporalRange } from "@hypit/temporal/algebra";

/** Derived observations on the accepted Media clock. */
export type MediaViewRequest =
  | { readonly kind: "media.thumbnail"; readonly at?: ExactTemporalValue; readonly height?: number; readonly coverWidth?: number }
  | { readonly kind: "media.storyboard"; readonly range?: TemporalRange; readonly frames: number; readonly height?: number; readonly coverWidth?: number }
  | { readonly kind: "media.waveform"; readonly range: TemporalRange; readonly width?: number; readonly height?: number }
  | { readonly kind: "media.audio-preview"; readonly range: TemporalRange };

/** The atlas stores distinct decoded frames. Sample addresses map back to their tile. */
export type MediaStoryboardAtlas = {
  readonly count: number;
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly samples: readonly { readonly at: ExactTemporalValue; readonly tile: number }[];
};

/** Peak envelope for a contiguous source-clock block. The last bucket can be partial. */
export type MediaAudioPeaks = {
  readonly sampleRate: number;
  readonly sampleCount: number;
  readonly samplesPerPeak: number;
  readonly peaks: readonly number[];
};

export const mediaPreviewSampleRate = 48_000;
export const waveformPeaksPerBlock = 512;
export const picturePreviewRates = [2, 4, 8, 16, 32, 64] as const;
export type PicturePreviewRate = typeof picturePreviewRates[number];

export function isPicturePreviewRate(value: unknown): value is PicturePreviewRate {
  return picturePreviewRates.some(rate => rate === value);
}

/** Quantize the display scale to an octave of the Media PCM clock. */
export function waveformPreviewResolution(secondsPerPixel: number): number {
  const exponent = Math.floor(Math.log2(secondsPerPixel * mediaPreviewSampleRate));
  return 2 ** Math.min(30, Math.max(4, exponent));
}

export function isWaveformPreviewResolution(value: unknown): value is number {
  return typeof value === "number" && value >= 16 && value <= 2 ** 30 && Number.isInteger(Math.log2(value));
}

/** Source-clock samples for reusable Media previews. Blocks start at zero at every waveform resolution. */
export type MediaSourcePreviewRequest = { readonly kind: "media.source-preview" } & (
  | { readonly preset: "filmstrip"; readonly positions: readonly ExactTemporalValue[]; readonly samplesPerSecond?: PicturePreviewRate }
  | { readonly preset: "waveform"; readonly samplesPerPeak: number; readonly blocks: readonly number[] }
);

export type MediaSourcePreviewBlock = {
  /** Constant pictures cover the whole source. */
  readonly range?: TemporalRange;
  readonly positions?: readonly ExactTemporalValue[];
  readonly atlas?: MediaStoryboardAtlas;
  readonly displayAspectRatio?: number;
  readonly samplesPerPeak?: number;
};
