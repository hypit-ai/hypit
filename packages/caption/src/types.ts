import type { TimingQuality } from "@svml/contracts";

export type CaptionFieldValueSchema =
  | { readonly kind: "boolean" }
  | { readonly kind: "enum"; readonly values: readonly string[] }
  | { readonly kind: "number"; readonly minimum?: number; readonly maximum?: number };

export type CaptionFieldDeclaration = {
  readonly id: string;
  readonly value: CaptionFieldValueSchema;
  readonly instruction: string;
  readonly minimumPerCue: number;
  readonly maximumPerCue: number;
};

export type CaptionPlanningRequirements = {
  readonly cueInstruction: string;
  readonly fields: readonly CaptionFieldDeclaration[];
};

export type CaptionDisplayAtom = {
  readonly id: string;
  readonly index: number;
  readonly regionId: string;
  readonly segmentId: string;
  readonly turnId: string;
  readonly role?: string;
  readonly text: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly sourceTokenStart: number;
  readonly sourceTokenEndExclusive: number;
  readonly correspondence: "exact" | "region-envelope";
};

export type CaptionFieldAssignment = {
  readonly declarationId: string;
  readonly atomId: string;
  readonly value: string;
};

export type CaptionPlannedCue = {
  readonly id: string;
  readonly atomIds: readonly string[];
  readonly fields: readonly CaptionFieldAssignment[];
};

export type CaptionPlannedRun = {
  readonly id: string;
  readonly styleId: string;
  readonly cues: readonly CaptionPlannedCue[];
};

/** Planner-neutral result. Model/provider identity remains in the producing Graph and Receipt. */
export type CaptionPlan = {
  readonly contract: "svml.caption-plan@1";
  readonly runs: readonly CaptionPlannedRun[];
};

export type CaptionStyleIntent = {
  readonly contract: "svml.caption-style@1";
  readonly id: string;
  readonly planning: CaptionPlanningRequirements;
  readonly presentation: {
    readonly mode: CaptionPresentationMode;
    readonly stackingOrder: number;
    readonly style: CaptionTrackProgram["style"];
  };
};

export type CaptionProgramRun = {
  readonly id: string;
  readonly styleId: string;
  readonly atomIds: readonly string[];
};

/** Total, ordered style assignment over one Caption display universe. */
export type CaptionProgram = {
  readonly contract: "svml.caption-program@1";
  readonly id: string;
  readonly defaultStyleId: string;
  readonly styles: readonly CaptionStyleIntent[];
  readonly atoms: readonly CaptionDisplayAtom[];
  readonly runs: readonly CaptionProgramRun[];
};

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
  readonly runId?: string;
  readonly styleId?: string;
  readonly display: string;
  readonly segmentId: string;
  readonly kind: "identity" | "alias" | "hidden";
  readonly sourceTokenIds: readonly string[];
  readonly startSec: number;
  readonly endSec: number;
  readonly startQuality: TimingQuality;
  readonly endQuality: TimingQuality;
  readonly refinements: readonly TimedCaptionRefinement[];
  readonly fields?: readonly CaptionFieldAssignment[];
};

export type TimedCaptionProjection = {
  readonly contract: "svml.timed-caption-projection@1";
  readonly text: string;
  readonly regions: readonly TimedCaptionRegion[];
};

export type CaptionPresentationMode = "whole" | "proportional-word" | "character-flow";

export type CaptionPresentationUnit = {
  readonly id: string;
  readonly regionId: string;
  readonly runId?: string;
  readonly styleId?: string;
  readonly display: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly basis: "region-envelope" | "exact-correspondence" | "presentation-estimate";
  readonly timingQuality: TimingQuality;
  readonly fields?: readonly CaptionFieldAssignment[];
};

export type CaptionPresentationPlan = {
  readonly contract: "svml.caption-presentation-plan@1";
  readonly mode: CaptionPresentationMode;
  readonly units: readonly CaptionPresentationUnit[];
};

/** Official caption package's author-facing lowering program, not a Core type. */
export type CaptionTrackProgram = {
  readonly contract: "svml.caption-track-program@1";
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
    readonly leftPercent?: number;
    readonly topPercent?: number;
    readonly widthPercent?: number;
    readonly lineHeight?: number;
    readonly textAlign: "left" | "center" | "right";
  };
};
