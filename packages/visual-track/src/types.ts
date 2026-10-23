import type { FrameSpan, VisualEasing, VisualSourceTimeMap, VisualSourceTimeRational } from "@hypit/composition";
import type { CompositableSurfaceRef, MediaRational } from "@hypit/media";
import type { BlobRef } from "@hypit/hypit/protocol";
import type {
  ContentFit,
  IntrinsicExtent,
  SpatialFrame,
  SpatialMap2D,
  SpatialPath,
} from "@hypit/spatial";

/** Intrinsic visual truth resolved before Media authoring; never a Provider or lineage envelope. */
export type MediaVisualSource =
  | {
      readonly kind: "still";
      readonly artifact: BlobRef;
      readonly extent: IntrinsicExtent;
    }
  | {
      readonly kind: "timed";
      readonly artifact: BlobRef;
      readonly extent: IntrinsicExtent;
      readonly frameRate: MediaRational;
      readonly frameCount: number;
    }
  | {
      readonly kind: "surface";
      readonly surface: CompositableSurfaceRef;
      readonly extent: IntrinsicExtent;
    };

/** Start/end-relative point in one target or source frame domain. */
export type VisualSourceTimePoint = {
  readonly edge: "start" | "end";
  /** Positive from start, negative from end; zero names the edge itself. */
  readonly offsetFrames: number;
};

export type VisualSourceTimeBounds = {
  readonly from: VisualSourceTimePoint;
  readonly until: VisualSourceTimePoint;
};

/** One author relation. Unknown target/source lengths are resolved only when the Clip is lowered. */
export type VisualSourceTimeRelation =
  | {
      readonly kind: "rate";
      readonly target: VisualSourceTimeBounds;
      readonly targetAt: VisualSourceTimePoint;
      readonly sourceAt: VisualSourceTimePoint;
      readonly rate: VisualSourceTimeRational;
      readonly source: VisualSourceTimeBounds;
      readonly wrap?: VisualSourceTimeBounds;
    }
  | {
      readonly kind: "fit";
      readonly target: VisualSourceTimeBounds;
      readonly source: VisualSourceTimeBounds;
    };

export type VisualSourceTimeSpec = {
  readonly relations: readonly VisualSourceTimeRelation[];
};

export type MediaVisualSourceTime =
  | { readonly kind: "spec"; readonly value: VisualSourceTimeSpec }
  | { readonly kind: "map"; readonly value: VisualSourceTimeMap };

export type MediaGradientStop = {
  readonly offset: number;
  readonly color: string;
};

export type MediaPaint =
  | { readonly kind: "solid"; readonly color: string }
  | {
      readonly kind: "linear-gradient";
      readonly angleDeg: number;
      readonly stops: readonly MediaGradientStop[];
    }
  | {
      readonly kind: "radial-gradient";
      readonly center: { readonly x: number; readonly y: number };
      readonly stops: readonly MediaGradientStop[];
    };

export type MediaSampleAppearance = {
  readonly opacity: number;
  readonly filter: {
    readonly blurPx: number;
    readonly brightness: number;
    readonly contrast: number;
    readonly saturation: number;
  };
};

export type MediaSamplingKeyframe = {
  /** Normalized position inside the resolved Clip envelope. */
  readonly atProgress: number;
  readonly zoom: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotationDeg: number;
  readonly easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

export type MediaSamplingMotion = {
  readonly keyframes: readonly MediaSamplingKeyframe[];
};

export type MediaPaintLayerProgram = {
  readonly id: string;
  readonly kind: "paint";
  readonly paint: MediaPaint;
  readonly opacity: number;
};

/** Author relation retained only until the Clip's destination Frame is known. */
export type MediaSamplePlacement =
  | { readonly kind: "fit"; readonly fit: ContentFit }
  | { readonly kind: "mapping"; readonly mapping: SpatialMap2D };

export type MediaSampleLayer = {
  readonly id: string;
  readonly kind: "sample";
  /** Absent exactly for still material; timed material always carries source-time intent. */
  readonly sourceTime?: MediaVisualSourceTime;
  readonly source: MediaVisualSource;
  readonly placement: MediaSamplePlacement;
  readonly appearance: MediaSampleAppearance;
  readonly samplingMotion?: MediaSamplingMotion;
};

export type MediaLayer = MediaPaintLayerProgram | MediaSampleLayer;

/** Resolved source-to-picture fact consumed by rendering and spatial evidence adapters. */
export type MediaSampleLayerProgram = Omit<MediaSampleLayer, "placement"> & {
  readonly mapping: SpatialMap2D;
};

export type MediaLayerProgram = MediaPaintLayerProgram | MediaSampleLayerProgram;

export type MediaPaintLayerSpec = {
  readonly id: string;
  readonly paint: MediaPaint;
  readonly opacity: number;
};

export type MediaSampleLayerSpec = {
  readonly id: string;
  /** Omission means bounded partial identity for timed material. */
  readonly sourceTime?: VisualSourceTimeSpec;
  readonly appearance: MediaSampleAppearance;
  readonly samplingMotion?: MediaSamplingMotion;
};

export type MediaLayerSet = {
  readonly layers: readonly MediaLayer[];
};

export type MediaPadding = {
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
  readonly leftPx: number;
};

export type MediaFrameClip =
  | { readonly kind: "none" }
  | { readonly kind: "frame" }
  | { readonly kind: "rounded"; readonly radiusPx: number }
  | { readonly kind: "path"; readonly path: SpatialPath };

export type VisualFrameTreatment = {
  readonly clip: MediaFrameClip;
  readonly padding: MediaPadding;
  readonly border?: {
    readonly widthPx: number;
    readonly style: "solid" | "dashed" | "dotted";
    readonly color: string;
  };
  readonly shadows: readonly {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly blurPx: number;
    readonly spreadPx: number;
    readonly color: string;
  }[];
};

/**
 * A position on a Clip-local clock. Frame offsets keep authored entrances and exits exact while
 * normalized progress lets one Motion adapt to differently sized Windows.
 */
export type VisualMotionPosition =
  | { readonly kind: "progress"; readonly value: number }
  | { readonly kind: "start"; readonly offsetFrames: number }
  | { readonly kind: "end"; readonly offsetFrames: number };

/** One complete affine/opacity state. There are no named aesthetic operators in the base model. */
export type VisualPoseKeyframe = {
  readonly at: VisualMotionPosition;
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly originX: number;
  readonly originY: number;
  readonly easing?: VisualEasing;
};

/** Reusable Clip-local visual motion. Components may construct the same value directly. */
export type VisualClipMotion = {
  readonly keyframes: readonly VisualPoseKeyframe[];
};

export type VisualClipSpec = {
  readonly id: string;
  readonly treatment: VisualFrameTreatment;
  readonly motion?: VisualClipMotion;
};

export type VisualClipProgram = {
  readonly id: string;
  /** One author-owned Clip occurrence realized by this absolute Window. */
  readonly subjectId: string;
  readonly span: FrameSpan;
  readonly frame: SpatialFrame;
  readonly treatment: VisualFrameTreatment;
  readonly layers: readonly MediaLayerProgram[];
  readonly motion?: VisualClipMotion;
};

export type VisualTrackProgram = {
  readonly id: string;
  readonly clips: readonly VisualClipProgram[];
};

export type VisualTrackHeader = {
  readonly id: string;
};

export type VisualTrackSet = {
  readonly clips: readonly VisualClipProgram[];
};
