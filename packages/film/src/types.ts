import type { Track } from "@hypit/composition";

/** Package-owned authoring value. A future Film Surface may produce this record. */
export type FilmProgram = {
  readonly id: string;
  readonly clearColor: string;
  readonly visual: FilmVisualPlan;
  /** Slots of root AudioTrack inputs summed by Film. */
  readonly audio: readonly number[];
};

export type FilmVisualPlanMember =
  | { readonly kind: "track"; readonly id: string; readonly slot: number }
  | {
      readonly kind: "stack";
      readonly id: string;
      readonly members: readonly FilmVisualPlanMember[];
    };

/** Author-declared recursive visual grouping before Track values are evaluated. */
export type FilmVisualPlan = {
  readonly members: readonly FilmVisualPlanMember[];
};

/**
 * Immutable package-private fold value used to collect an arbitrary number of
 * peer Tracks without adding variadic Operation ports to Core. Slot order is
 * only the binding order; visual order belongs to FilmVisualPlan.members.
 */
export type FilmTrackSet = {
  readonly tracks: readonly Track[];
};

export type FilmTrackInput = {
  /** Fragment input name used by the author module lowering this Film instance. */
  readonly name: string;
  readonly kind: "visual" | "audio";
};

export type FilmAssemblyFragmentOptions = {
  readonly name?: string;
  readonly tracks: readonly FilmTrackInput[];
};
