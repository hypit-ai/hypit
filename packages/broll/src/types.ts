import type {
  AudioTrack,
  FrameSpan,
  MediaArtifactRef,
  ProgramSpace,
  VisualTrack,
} from "@svml/contracts";
import type { Digest } from "@svml/protocol";

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
  readonly includeAudio?: boolean;
  readonly audioGain?: number;
  readonly enter?: BrollMotion;
  readonly exit?: BrollMotion;
};

export type BrollPairTransition = {
  readonly id: string;
  readonly fromItemId: string;
  readonly toItemId: string;
  readonly span: FrameSpan;
  readonly operator: "push" | "page-turn";
  readonly direction: "left" | "right" | "up" | "down";
  readonly sfx?: {
    readonly artifact: MediaArtifactRef;
    readonly gain?: number;
  };
};

/** Official B-roll authoring/lowering value. It is not a Core contract. */
export type BrollProgram = {
  readonly contract: "svml.broll-program@1";
  readonly digest: Digest;
  readonly id: string;
  readonly programSpaceDigest: Digest;
  readonly items: readonly BrollItem[];
  readonly transitions: readonly BrollPairTransition[];
};

/** One atomic compilation result followed by ordinary deterministic projections. */
export type BrollProduct = {
  readonly contract: "svml.broll-product@1";
  readonly productDigest: Digest;
  readonly programDigest: Digest;
  readonly programSpace: ProgramSpace;
  readonly visualTrack: VisualTrack;
  readonly audioTrack: AudioTrack;
};
