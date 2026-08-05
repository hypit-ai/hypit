import type { ProgramSpace, Track } from "@svml/contracts";
import type { Digest } from "@svml/protocol";

/** Package-owned authoring value. A future Film Surface may produce this record. */
export type FilmProgram = {
  readonly contract: "svml.film-program@1";
  readonly digest: Digest;
  readonly id: string;
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly clearColor: string;
  };
};

/**
 * Immutable package-private fold value used to collect an arbitrary number of
 * peer Tracks without adding variadic Operation ports to Core.
 */
export type FilmTrackSet = {
  readonly contract: "svml.film-track-set@1";
  readonly digest: Digest;
  readonly programSpace: ProgramSpace;
  readonly tracks: readonly Track[];
  readonly lastAddition?: {
    readonly previousSetDigest: Digest;
    readonly trackDigest: Digest;
  };
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
