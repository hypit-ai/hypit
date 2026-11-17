import type { ExactTemporalValue, TemporalRange } from "@hypit/temporal/algebra";

/** Derived observations on the accepted Media clock. */
export type MediaViewRequest =
  | { readonly kind: "media.thumbnail"; readonly at?: ExactTemporalValue; readonly height?: number }
  | { readonly kind: "media.storyboard"; readonly range: TemporalRange; readonly frames: number; readonly height?: number }
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
