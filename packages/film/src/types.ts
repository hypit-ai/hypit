import type { Track } from "@hypit/composition";

/** Package-owned authoring value. A future Film Surface may produce this record. */
export type FilmProgram = {
  readonly id: string;
  readonly clearColor: string;
};

/**
 * Immutable package-private fold value used to collect an arbitrary number of
 * peer Tracks without adding variadic Operation ports to Core.
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
