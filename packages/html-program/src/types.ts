
import type { BlobRef } from "@hypit/hypit/protocol";
import type { CompositableSurfaceRef, PictureInterpretation, PreparedVisualSource } from "@hypit/media";
import type { Clock, FrameSpan } from "@hypit/timeline";
import type { TemporalMap } from "@hypit/temporal";

export type HtmlFrameDomain = Clock & {
  /** Legal frame indices are exactly [0, frameCount). */
  readonly frameCount: number;
};

export type HtmlCanvas = {
  readonly width: number;
  readonly height: number;
};

export type HtmlArtifactUsage =
  | { readonly kind: "never" }
  | { readonly kind: "always" }
  | {
      readonly kind: "frames";
      /** Ordered, disjoint absolute half-open spans where this Artifact can be observed. */
      readonly spans: readonly FrameSpan[];
    };

type HtmlArtifactBase = {
  /** Programme-local identity used by generated markup; independent of Blob storage identity. */
  readonly id: string;
  readonly artifact: BlobRef;
  readonly usage: HtmlArtifactUsage;
};

/** One byte dependency and the compiler's conservative proof of when it can be observed. */
export type HtmlArtifact = HtmlArtifactBase & (
  | {
      /** Resource closure whose presentation meaning is either absent or typed elsewhere. */
      readonly kind: "bytes";
    }
  | {
      /** A browser-presented still whose colour interpretation must be verified before capture. */
      readonly kind: "picture";
      readonly picture: PictureInterpretation;
    }
);

export type HtmlSurface = {
  /** Programme-local Artifact identity referenced by Surface markers and sampled occurrences. */
  readonly artifactId: string;
  readonly surface: CompositableSurfaceRef;
  /** Absolute parent frames where this Surface can contribute pixels. */
  readonly usage: HtmlArtifactUsage;
};

/** One compiler-owned use of renderer-private Process input rasterization. */
export type HtmlProcessUsage = {
  /** Compiler order of this Process inside its owning document. */
  readonly order: number;
  /** Number of named input pictures the renderer must rasterize for this Process. */
  readonly passes: number;
  /** Exact compiler-owned stage keys, in named-input execution order. */
  readonly stageKeys: readonly string[];
  /** Ordered, disjoint absolute parent-frame spans where these passes can execute. */
  readonly spans: readonly FrameSpan[];
};

export type HtmlVideoSource = FrameSpan & {
  /** Programme-local identity of this exact source occurrence. */
  readonly id: string;
  /** Compiler-owned stable media display plane inside the document. */
  readonly elementId: string;
  /** Exact absolute frames where this occurrence can contribute pixels. */
  readonly usage: HtmlArtifactUsage;
} & (
  | {
      readonly kind: "media";
      readonly source: PreparedVisualSource;
      /** Exact occurrence-local target-to-source relation. */
      readonly sampling: TemporalMap;
    }
  | {
      readonly kind: "surface";
      /** Already-materialized Surface Artifact whose decoded frames feed this occurrence. */
      readonly artifactId: string;
      /** Author-declared interpretation of the materialized Surface pixels. */
      readonly picture: PictureInterpretation;
      readonly sourceFrame: { readonly numerator: number; readonly denominator: number };
      readonly sourceRate: { readonly numerator: number; readonly denominator: number };
      readonly sourceFrameRate: { readonly numerator: number; readonly denominator: number };
    }
);

/** Portable, frame-addressed HTML visual program. */
export type HtmlProgram = HtmlFrameDomain & {
  readonly canvas: HtmlCanvas;
  /** Exact request-projectable topology of Scope-level Picture Process work. */
  readonly processUsages: readonly HtmlProcessUsage[];
  /** Every byte resource referenced by the HTML template, with its conservative temporal usage. */
  readonly artifacts: readonly HtmlArtifact[];
  /** Typed Surface dependencies that a Runtime must verify before rasterization. */
  readonly surfaces: readonly HtmlSurface[];
  /** Exact selected streams and sampling functions; execution never parses them back out of markup. */
  readonly videoSources: readonly HtmlVideoSource[];
  /** Media URLs remain hypit-artifact:// placeholders until a Runtime materializes them. */
  readonly html: string;
};

export type ResourceUrlResolver = (artifact: BlobRef, id: string) => string;
