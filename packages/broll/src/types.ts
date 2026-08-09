import type { MediaArtifactRef } from "@narratage/media";
import type { BlobRef } from "@narratage/protocol";
import type { AudioTrack, FrameSpan, VisualTrack } from "@narratage/composition";

export type BrollBox = {
  readonly xPercent: number;
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
};

export type BrollMotionOperator = "fade" | "pop" | "slide-up" | "slide-down";

export type BrollMotion = {
  readonly operator: BrollMotionOperator;
  readonly durationFrames: number;
  /** Slide distance or pop start/end scale. Package-defined and deterministic. */
  readonly amount?: number;
};

export type BrollItem = {
  readonly id: string;
  readonly artifact: MediaArtifactRef;
  readonly span: FrameSpan;
  readonly z: number;
  readonly tieBreak: string;
  readonly box: BrollBox;
  readonly fit: "contain" | "cover";
  readonly playback: "freeze" | "native" | "loop" | "stretch";
  readonly mediaStartSec?: number;
  readonly audio?: {
    readonly artifact: BlobRef;
    readonly sampleFrames: number;
    readonly gain: number;
  };
  readonly enter?: BrollMotion;
  readonly exit?: BrollMotion;
  readonly backgroundColor?: string;
  readonly borderRadiusPx?: number;
};

export type BrollPairTransition = {
  readonly id: string;
  readonly fromItemId: string;
  readonly toItemId: string;
  readonly span: FrameSpan;
  readonly operator: "push" | "page-turn";
  readonly direction: "left" | "right" | "up" | "down";
  readonly sfx?: {
    readonly artifact: BlobRef;
    readonly sampleFrames: number;
    readonly gain: number;
  };
};

/** Official B-roll authoring/lowering value. It is not a Core contract. */
export type BrollProgram = {
  readonly contract: "svml.broll-program@1";
  readonly id: string;
  readonly items: readonly BrollItem[];
  readonly transitions: readonly BrollPairTransition[];
};

/** One atomic compilation result followed by ordinary deterministic projections. */
export type BrollProduct = {
  readonly contract: "svml.broll-product@1";
  readonly visualTrack: VisualTrack;
  readonly audioTrack: AudioTrack;
};

export type BrollItemSpec = {
  readonly contract: "svml.broll-item-spec@1";
  readonly id: string;
  readonly z: number;
  readonly box: BrollBox;
  readonly fit: "contain" | "cover";
  readonly backgroundColor?: string;
  readonly borderRadiusPx?: number;
  readonly enter?: BrollMotion;
  readonly exit?: BrollMotion;
};

export type BrollTrackSpec = {
  readonly contract: "svml.broll-track-spec@1";
  readonly id: string;
};

export type BrollSet = {
  readonly contract: "svml.broll-set@1";
  readonly items: readonly BrollItem[];
};

export type BrollSurfaceItemInput = {
  readonly mediaName: string;
  readonly selectionName: string;
  readonly specName: string;
};
