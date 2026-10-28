
import type { BlobRef } from "@hypit/hypit/protocol";
import type { CompositableSurfaceRef, PreparedVisualSource } from "@hypit/media";
import type { Clock, FrameSpan } from "@hypit/timeline";
import type { TemporalMap } from "@hypit/temporal";
import { VISUAL_IR_V1 } from "@hypit/composition";

export type HtmlFrameDomain = Clock & {
  /** Legal frame indices are exactly [0, frameCount). */
  readonly frameCount: number;
};

export type HtmlCanvas = {
  readonly width: number;
  readonly height: number;
};

export type HtmlArtifactUsage =
  | { readonly kind: "always" }
  | {
      readonly kind: "frames";
      /** Ordered, disjoint absolute half-open spans where this Artifact can be observed. */
      readonly spans: readonly FrameSpan[];
    };

/** One byte dependency and the compiler's conservative proof of when it can be observed. */
export type HtmlArtifact = {
  /** Programme-local identity used by generated markup; independent of Blob storage identity. */
  readonly id: string;
  readonly artifact: BlobRef;
  readonly usage: HtmlArtifactUsage;
};

export type HtmlSurface = {
  /** Programme-local Artifact identity referenced by Surface markers and sampled occurrences. */
  readonly artifactId: string;
  readonly surface: CompositableSurfaceRef;
};

export type HtmlVideoSource = FrameSpan & {
  /** Document-local DOM identity of the compiled source occurrence. */
  readonly id: string;
} & (
  | {
      readonly kind: "media";
      readonly source: PreparedVisualSource;
      /** Exact occurrence-local to source-presentation relation. */
      readonly sampling: TemporalMap;
    }
  | {
      readonly kind: "surface";
      /** Already-materialized Surface Artifact whose decoded frames feed this occurrence. */
      readonly artifactId: string;
      readonly sourceFrame: { readonly numerator: number; readonly denominator: number };
      readonly sourceRate: { readonly numerator: number; readonly denominator: number };
      readonly sourceFrameRate: { readonly numerator: number; readonly denominator: number };
    }
);

/** Portable, frame-addressed HTML visual program. */
export type HtmlProgram = HtmlFrameDomain & {
  readonly visualIr: typeof VISUAL_IR_V1;
  readonly canvas: HtmlCanvas;
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
