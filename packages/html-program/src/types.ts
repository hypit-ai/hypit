
import type { BlobRef } from "@hypit/protocol";
import type { PictureInterpretation, PreparedPictureSampling } from "@hypit/media";
import type { FrameSpan, TemporalSamplingGrid } from "@hypit/temporal";
import type { HtmlPictureReconstruction } from "./picture-reconstruction.js";

export type HtmlFrameDomain = TemporalSamplingGrid & {
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

export type HtmlVideoSource = FrameSpan & PreparedPictureSampling & {
  /** Programme-local identity of this exact source occurrence. */
  readonly id: string;
  /** Compiler-owned stable media display plane inside the document. */
  readonly elementId: string;
  /** Exact absolute frames where this occurrence can contribute pixels. */
  readonly usage: HtmlArtifactUsage;
  readonly kind: "media";
  /** `sampling` is the exact occurrence-local target-to-source relation. */
  readonly reconstruction?: HtmlPictureReconstruction;
};

/** Portable, frame-addressed HTML visual program. */
export type HtmlProgram = HtmlFrameDomain & {
  readonly canvas: HtmlCanvas;
  /** Every byte resource referenced by the HTML template, with its conservative temporal usage. */
  readonly artifacts: readonly HtmlArtifact[];
  /** Exact selected streams and sampling functions; execution never parses them back out of markup. */
  readonly videoSources: readonly HtmlVideoSource[];
  /** Media URLs remain hypit-artifact:// placeholders until the execution host materializes them. */
  readonly html: string;
};

export type ResourceUrlResolver = (artifact: BlobRef, id: string) => string;
