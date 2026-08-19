import type {
  FrameSpan,
  VisualTextDocument,
  VisualTextFlow,
  VisualTextPaintLayer,
  VisualTextTypography,
} from "@hypit/composition";
import type {
  MediaFramePresentation,
  MediaLayerSet,
  MediaLifecycleMotion,
} from "@hypit/media-track";
import type { SpatialFrame } from "@hypit/spatial";

export type DepthStackVisibility = {
  readonly previous: number;
  readonly next: number;
  readonly wrap: boolean;
};

export type DeckCardTone = {
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
};

export type DepthStackPose = {
  readonly xPx: number;
  readonly yPx: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly stacking: number;
  readonly tone: DeckCardTone;
};

export type DepthStackPoseStep = {
  readonly xPerDepthPx: number;
  readonly yPerDepthPx: number;
  readonly scalePerDepth: number;
  readonly rotationPerDepthDeg: number;
  readonly rotationMode: "linear" | "alternate";
  readonly opacityPerDepth: number;
  readonly stackingPerDepth: number;
  readonly tonePerDepth: DeckCardTone;
};

export type DepthStackPoseModel = {
  readonly current: DepthStackPose;
  readonly previous: DepthStackPoseStep;
  readonly next: DepthStackPoseStep;
};

export type DepthStackReflow = {
  readonly durationFrames: number;
  readonly easing: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

export type DepthStackSpec = {
  readonly visibility: DepthStackVisibility;
  readonly poses: DepthStackPoseModel;
  readonly reflow: DepthStackReflow;
  readonly presentation: MediaFramePresentation;
  readonly motion: MediaLifecycleMotion;
  readonly stackingOrder: number;
};

export type DepthStackCardPlayback = {
  readonly future: "hold-head" | "continue";
  readonly past: "hold-tail" | "continue" | "hide";
};

export type DepthStackCardLabel =
  | { readonly kind: "none" }
  | {
      readonly kind: "text";
      readonly document: VisualTextDocument;
      readonly typography: VisualTextTypography;
      readonly paints: readonly VisualTextPaintLayer[];
      readonly flow: VisualTextFlow;
    };

export type DepthStackCardLabelStyle = {
  readonly typography: VisualTextTypography;
  readonly paints: readonly VisualTextPaintLayer[];
  readonly flow: VisualTextFlow;
};

export type DepthStackCardSpec = {
  readonly id: string;
  readonly playback: DepthStackCardPlayback;
};

export type DepthStackCard = {
  readonly id: string;
  readonly activationFrame: number;
  readonly material: MediaLayerSet;
  readonly label: DepthStackCardLabel;
  readonly playback: DepthStackCardPlayback;
};

export type DepthStackCardSet = {
  readonly cards: readonly DepthStackCard[];
};

export type DepthStackHeader = {
  readonly id: string;
};

export type DepthStackProgram = {
  readonly id: string;
  readonly span: FrameSpan;
  readonly terminalFrame: number;
  readonly frame: SpatialFrame;
  readonly spec: DepthStackSpec;
  readonly cards: readonly DepthStackCard[];
};

export type DepthStackState = ReadonlyMap<number, number>;
