import type { Digest } from "@svml/protocol";

export type HyperframesFrameDomain = {
  /** Exact ProgramSpace whose integer frame domain this document renders. */
  readonly programSpaceDigest: Digest;
  readonly frameRate: {
    readonly numerator: number;
    readonly denominator: number;
  };
  /** Legal frame indices are exactly [0, frameCount). */
  readonly frameCount: number;
};

export type HyperframesCanvas = {
  readonly width: number;
  readonly height: number;
};

/** Deterministic, portable input to a local or remote HyperFrames renderer. */
export type HyperframesDocument = HyperframesFrameDomain & {
  readonly contract: "svml.hyperframes-document@2";
  readonly digest: Digest;
  readonly compositionDigest: Digest;
  readonly canvas: HyperframesCanvas;
  /** Every content-addressed media dependency referenced by the HTML template. */
  readonly artifactDigests: readonly Digest[];
  /** Media URLs remain svml-artifact:// placeholders until a Runtime materializes them. */
  readonly html: string;
};

/** Runtime-local work unit; chunk selection is never author intent or a Core object. */
export type HyperframesFrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type ArtifactUrlResolver = (digest: Digest) => string;
