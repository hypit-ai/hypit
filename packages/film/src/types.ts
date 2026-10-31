import type { Track, VisualProcessEffect } from "@hypit/composition";

/** Package-owned authoring value. A future Film Surface may produce this record. */
export type FilmProgram = {
  readonly id: string;
  readonly clearColor: string;
  readonly visual: FilmVisualPlan;
  /** Slots of root AudioTrack inputs summed by Film. */
  readonly audio: readonly number[];
  /** Editing groups address clip identities within the Film's Track inputs. */
  readonly links?: readonly FilmLink[];
};

export type FilmLink = {
  readonly id: string;
  readonly members: readonly { readonly slot: number; readonly clip: string }[];
};

export type FilmVisualPlanMember =
  | { readonly kind: "track"; readonly id: string; readonly slot: number }
  | {
      readonly kind: "stack";
      readonly id: string;
      readonly members: readonly FilmVisualPlanMember[];
    }
  | {
      readonly kind: "process";
      readonly id: string;
      readonly inputs: readonly {
        readonly name: string;
        readonly members: readonly FilmVisualPlanMember[];
      }[];
      readonly effect: VisualProcessEffect;
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
