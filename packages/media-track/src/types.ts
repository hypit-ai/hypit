import type { AudioTrack, FrameSpan, VisualTrack } from "@narratage/composition";
import type { CompositableSurfaceRef, MediaRational } from "@narratage/media";
import type { BlobRef } from "@narratage/protocol";
import type {
  ContentFit,
  IntrinsicExtent,
  SpatialFrame,
  SpatialPath,
} from "@narratage/spatial";
import type {
  OccurrenceExpansion,
  TemporalWindowProjection,
} from "@narratage/temporal";

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
      readonly audio?: {
        readonly artifact: BlobRef;
        readonly sampleFrames: number;
      };
    }
  | {
      readonly kind: "surface";
      readonly surface: CompositableSurfaceRef;
      readonly extent: IntrinsicExtent;
    };

export type MediaVisualTrim = {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type MediaVisualOccupancy =
  | { readonly mode: "once"; readonly align: "start" | "end" }
  | { readonly mode: "hold"; readonly align: "start" | "end" }
  | { readonly mode: "loop"; readonly align: "start" | "end" }
  | { readonly mode: "stretch" };

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
  /** Normalized position inside the resolved Item/member envelope. */
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

export type MediaSampleLayerProgram = {
  readonly id: string;
  readonly kind: "sample";
  readonly source: MediaVisualSource;
  readonly fit: ContentFit;
  readonly trim?: MediaVisualTrim;
  readonly occupancy?: MediaVisualOccupancy;
  readonly appearance: MediaSampleAppearance;
  readonly samplingMotion?: MediaSamplingMotion;
};

export type MediaLayerProgram = MediaPaintLayerProgram | MediaSampleLayerProgram;

export type MediaPaintLayerSpec = {
  readonly contract: "svml.media-paint-layer-spec@1";
  readonly id: string;
  readonly paint: MediaPaint;
  readonly opacity: number;
};

export type MediaSampleLayerSpec = {
  readonly contract: "svml.media-sample-layer-spec@1";
  readonly id: string;
  readonly trim?: MediaVisualTrim;
  readonly occupancy?: MediaVisualOccupancy;
  readonly appearance: MediaSampleAppearance;
  readonly samplingMotion?: MediaSamplingMotion;
};

export type MediaLayerSet = {
  readonly contract: "svml.media-layer-set@1";
  readonly layers: readonly MediaLayerProgram[];
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

export type MediaFramePresentation = {
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

export type MediaMotionDirection = "left" | "right" | "up" | "down";

export type MediaEdgeMotion = {
  readonly operator: "fade" | "slide" | "scale" | "pop" | "bounce" | "blur-reveal" | "wipe" | "flip" | "spin";
  readonly durationFrames: number;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
  readonly direction?: MediaMotionDirection;
  readonly amount?: number;
  readonly origin?: "outside-canvas";
};

export type MediaSustainMotion = {
  readonly operator: "float" | "breathe" | "pulse" | "wobble" | "shake" | "drift";
  readonly amount: number;
  readonly cycles: number;
  readonly direction?: MediaMotionDirection;
};

export type MediaLifecycleMotion = {
  readonly enter?: MediaEdgeMotion;
  readonly sustain: readonly MediaSustainMotion[];
  readonly exit?: MediaEdgeMotion;
};

export type MediaSourceAudioProjection = {
  readonly fromLayer: string;
  readonly gain: number;
};

export type MediaSoundSource = {
  readonly artifact: BlobRef;
  readonly sampleFrames: number;
};

export type MediaSoundTrigger =
  | { readonly kind: "enter" }
  | { readonly kind: "exit" }
  | { readonly kind: "handoff"; readonly handoffId: string };

export type MediaSoundSpec = {
  readonly contract: "svml.media-sound-spec@1";
  readonly id: string;
  readonly trigger: MediaSoundTrigger;
  readonly gain: number;
};

export type MediaSoundEvent = Omit<MediaSoundSpec, "contract"> & {
  readonly source: MediaSoundSource;
};

export type MediaSoundSet = {
  readonly contract: "svml.media-sound-set@1";
  readonly sounds: readonly MediaSoundEvent[];
};

export type MediaAbsoluteStacking = {
  readonly order: number;
  readonly tieBreak: string;
};

export type MediaItemSpec = {
  readonly contract: "svml.media-item-spec@1";
  readonly id: string;
  readonly projection: TemporalWindowProjection;
  readonly expansion: OccurrenceExpansion;
  readonly presentation: MediaFramePresentation;
  readonly motion: MediaLifecycleMotion;
  readonly stackingOrder: number;
  readonly sourceAudio?: MediaSourceAudioProjection;
};

export type MediaItemProgram = {
  readonly id: string;
  readonly sourceOccurrenceId: string;
  readonly span: FrameSpan;
  readonly frame: SpatialFrame;
  readonly presentation: MediaFramePresentation;
  readonly layers: readonly MediaLayerProgram[];
  readonly motion: MediaLifecycleMotion;
  readonly stacking: MediaAbsoluteStacking;
  readonly sourceAudio?: MediaSourceAudioProjection;
  readonly sounds: readonly MediaSoundEvent[];
};

export type MediaHandoffOperator = "cut" | "crossfade" | "push" | "wipe" | "cover" | "page-turn";

export type MediaHandoffProgram = {
  readonly id: string;
  readonly fromMemberId: string;
  readonly toMemberId: string;
  readonly operator: MediaHandoffOperator;
  readonly durationFrames: number;
  readonly boundaryRatio: number;
  readonly span: FrameSpan;
  readonly direction?: MediaMotionDirection;
  readonly audio: "cut" | "crossfade";
};

export type MediaSequenceMemberProgram = {
  readonly id: string;
  readonly activationFrame: number;
  readonly logicalSpan: FrameSpan;
  readonly visualSpan: FrameSpan;
  readonly layers: readonly MediaLayerProgram[];
  readonly sourceAudio?: MediaSourceAudioProjection;
};

export type MediaSequenceMemberSpec = {
  readonly contract: "svml.media-sequence-member-spec@1";
  readonly id: string;
  readonly sourceAudio?: MediaSourceAudioProjection;
};

export type MediaSequenceMemberSet = {
  readonly contract: "svml.media-sequence-member-set@1";
  readonly members: readonly {
    readonly id: string;
    readonly activationFrame: number;
    readonly layers: readonly MediaLayerProgram[];
    readonly sourceAudio?: MediaSourceAudioProjection;
  }[];
};

export type MediaHandoffSpec = Omit<MediaHandoffProgram, "span"> & {
  readonly contract: "svml.media-handoff-spec@1";
};

export type MediaSequenceSpec = {
  readonly contract: "svml.media-sequence-spec@1";
  readonly id: string;
  readonly presentation: MediaFramePresentation;
  readonly motion: MediaLifecycleMotion;
  readonly stackingOrder: number;
  readonly handoffs: readonly MediaHandoffSpec[];
};

export type MediaSequenceProgram = {
  readonly id: string;
  readonly span: FrameSpan;
  readonly terminalFrame: number;
  readonly frame: SpatialFrame;
  readonly presentation: MediaFramePresentation;
  readonly members: readonly MediaSequenceMemberProgram[];
  readonly handoffs: readonly MediaHandoffProgram[];
  readonly motion: MediaLifecycleMotion;
  readonly stacking: MediaAbsoluteStacking;
  readonly sounds: readonly MediaSoundEvent[];
};

export type MediaTrackProgram = {
  readonly contract: "svml.media-track-program@1";
  readonly id: string;
  readonly items: readonly MediaItemProgram[];
  readonly sequences: readonly MediaSequenceProgram[];
};

export type MediaTrackHeader = {
  readonly contract: "svml.media-track-header@1";
  readonly id: string;
};

export type MediaTrackSet = {
  readonly contract: "svml.media-track-set@1";
  readonly items: readonly MediaItemProgram[];
  readonly sequences: readonly MediaSequenceProgram[];
};

export type MediaVisualProjection = {
  readonly contract: "svml.media-visual-projection@1";
  readonly track: VisualTrack;
};

export type MediaAudioProjection = {
  readonly contract: "svml.media-audio-projection@1";
  readonly track: AudioTrack;
};
