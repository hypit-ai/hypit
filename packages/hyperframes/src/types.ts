
import type { BlobRef, Digest } from "@narratage/protocol";
import type { CompositableSurfaceRef } from "@narratage/media";

export type HyperframesFrameDomain = {
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
  readonly visualIr: typeof VISUAL_IR_V1;
  readonly canvas: HyperframesCanvas;
  /** Every content-addressed byte dependency referenced by the HTML template. */
  readonly artifacts: readonly BlobRef[];
  /** Typed Surface dependencies that a Runtime must verify before rendering. */
  readonly surfaces: readonly CompositableSurfaceRef[];
  /** Media URLs remain narratage-artifact:// placeholders until a Runtime materializes them. */
  readonly html: string;
};

/** Runtime-local work unit; chunk selection is never author intent or a Core object. */
export type HyperframesFrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type ArtifactUrlResolver = (artifact: BlobRef) => string;
import { VISUAL_IR_V1 } from "@narratage/visual-ir";
