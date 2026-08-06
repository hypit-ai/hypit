import type { ProgramSpace, TimingQuality } from "@svml/contracts";
import type { Digest } from "@svml/protocol";

export type TimedCaptionRefinement = {
  readonly id: string;
  readonly display: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly sourceTokenIds: readonly string[];
  readonly startSec: number;
  readonly endSec: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
  readonly relation: "exact";
};

export type TimedCaptionRegion = {
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly kind: "identity" | "alias" | "hidden";
  readonly sourceTokenIds: readonly string[];
  readonly startSec: number;
  readonly endSec: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
  readonly refinements: readonly TimedCaptionRefinement[];
};

export type TimedCaptionProjection = {
  readonly contract: "svml.timed-caption-projection@1";
  readonly programSpace: ProgramSpace;
  readonly text: string;
  readonly regions: readonly TimedCaptionRegion[];
  readonly projectionDigest: Digest;
};

export type CaptionPresentationMode = "whole" | "proportional-word" | "character-flow";

export type CaptionPresentationUnit = {
  readonly id: string;
  readonly regionId: string;
  readonly display: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly basis: "region-envelope" | "exact-correspondence" | "presentation-estimate";
  readonly timingQuality: TimingQuality;
};

export type CaptionPresentationPlan = {
  readonly contract: "svml.caption-presentation-plan@0";
  readonly mode: CaptionPresentationMode;
  readonly units: readonly CaptionPresentationUnit[];
  readonly planDigest: Digest;
};

/** Official caption package's author-facing lowering program, not a Core type. */
export type CaptionTrackProgram = {
  readonly contract: "svml.caption-track-program@1";
  readonly digest: Digest;
  readonly id: string;
  readonly mode: CaptionPresentationMode;
  readonly stacking: {
    readonly order: number;
    readonly tieBreak: string;
  };
  readonly style: {
    readonly fontFamily: string;
    readonly fontSizePx: number;
    readonly fontWeight: number;
    readonly color: string;
    readonly backgroundColor?: string;
    readonly paddingXPx: number;
    readonly paddingYPx: number;
    readonly borderRadiusPx: number;
    readonly bottomPercent: number;
    readonly maxWidthPercent: number;
    readonly textAlign: "left" | "center" | "right";
  };
};
