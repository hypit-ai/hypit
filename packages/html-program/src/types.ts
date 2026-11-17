import type { MediaResource, PictureInterpretation } from "@hypit/media";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type { HtmlPictureReconstruction } from "./reconstruction.js";

export type HtmlFrameRate = {
  readonly numerator: number;
  readonly denominator: number;
};

export type HtmlCanvas = {
  readonly width: number;
  readonly height: number;
  readonly background: string;
};

export type HtmlFrameSpan = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type HtmlArtifactUsage =
  | { readonly kind: "never" }
  | { readonly kind: "always" }
  | { readonly kind: "frames"; readonly spans: readonly HtmlFrameSpan[] };

type HtmlArtifactBase = {
  /** Programme-local identity, independent from the resource address. */
  readonly id: string;
  readonly resource: MediaResource;
  readonly usage: HtmlArtifactUsage;
};

export type HtmlArtifact = HtmlArtifactBase & (
  | { readonly kind: "bytes" }
  | { readonly kind: "picture"; readonly picture: PictureInterpretation }
);

/** One compiler-owned display plane and its exact output-frame sampling demand. */
export type HtmlVideoSource = {
  readonly id: string;
  readonly elementId: string;
  readonly resource: MediaResource;
  readonly streamIndex: number;
  readonly presentationStart: ExactTemporalValue;
  /** Closed display interpretation selected by the Media owner. */
  readonly interpretation: {
    readonly codedWidth: number;
    readonly codedHeight: number;
    readonly sampleAspectRatio: { readonly numerator: number; readonly denominator: number };
    readonly rotationDegrees: 0 | 90 | 180 | 270;
    readonly picture: PictureInterpretation;
  };
  readonly usage: HtmlArtifactUsage;
  /** Exact sided Source observations on the output grid. A null sample contributes no pixels. */
  readonly sourceFrames: readonly ({
    readonly position: ExactTemporalValue;
    readonly side: "before" | "after";
  } | null)[];
  readonly reconstruction?: HtmlPictureReconstruction;
};

export type HtmlVisualDependency =
  | { readonly kind: "data"; readonly id: string; readonly resource: MediaResource }
  | {
      readonly kind: "font";
      readonly id: string;
      readonly resource: MediaResource;
      readonly family: string;
      readonly weight?: string;
      readonly style?: string;
    }
  | {
      readonly kind: "picture";
      readonly id: string;
      readonly resource: MediaResource;
      readonly picture: PictureInterpretation;
    };

export type HtmlVisual = {
  /** Fragment placed inside one compiler-owned root. Named Picture inputs use `{{input:name}}`. */
  readonly html: string;
  /** Rules scoped to the compiler-owned root. `:scope` addresses that root. */
  readonly css?: string;
  /** Function body receiving `(root, data, context)` and returning synchronous `render(localFrame)`. */
  readonly setup?: string;
  readonly data?: unknown;
  /** Package-owned bytes and stills. Timed media arrives only through named Picture inputs. */
  readonly dependencies?: readonly HtmlVisualDependency[];
};

/** Portable, frame-addressed HTML Picture terminal program. */
export type HtmlProgram = {
  readonly frameRate: HtmlFrameRate;
  readonly frameCount: number;
  readonly canvas: HtmlCanvas;
  readonly artifacts: readonly HtmlArtifact[];
  readonly videoSources: readonly HtmlVideoSource[];
  /** Resource URLs remain `hypit-artifact://` placeholders until local execution stages them. */
  readonly html: string;
};

export type HtmlPictureOutput = {
  readonly alpha: "opaque" | "straight";
  readonly matte?: string;
};

export type HtmlRasterRequest = {
  readonly program: HtmlProgram;
  readonly range?: HtmlFrameSpan;
  readonly picture: HtmlPictureOutput;
  readonly quality: "draft" | "standard" | "high";
};

export type HtmlFrameRequest = {
  readonly program: HtmlProgram;
  readonly frames: readonly number[];
  readonly picture: HtmlPictureOutput;
};

export type RenderedVisual = {
  readonly resource: MediaResource;
  readonly frameRate: HtmlFrameRate;
  readonly frameCount: number;
  readonly width: number;
  readonly height: number;
};
