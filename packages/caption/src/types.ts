
import type { CanonicalValue } from "@narratage/protocol";

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
  readonly cue: {
    readonly minimumWords: number;
    readonly maximumWords: number;
    readonly instruction: string;
  };
  readonly fields: readonly CaptionFieldDeclaration[];
};

export type CaptionFieldAssignment = {
  readonly declarationId: string;
  readonly wordId: string;
  readonly value: string;
};

export type CaptionPlannedCue = {
  readonly id: string;
  readonly wordIds: readonly string[];
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
  readonly rendering: {
    /** Package-owned Style family. It must understand every declared planning field. */
    readonly family: string;
    /** Complete Recipe-resolved parameters, opaque to the common Caption package. */
    readonly parameters: CanonicalValue;
  };
};

export type CaptionProgramRun = {
  readonly id: string;
  readonly styleId: string;
  readonly wordIds: readonly string[];
};

/** Total, ordered style assignment over one Caption display universe. */
export type CaptionProgram = {
  readonly contract: "svml.caption-program@1";
  readonly id: string;
  readonly wordSequenceId: string;
  readonly defaultStyleId: string;
  readonly styles: readonly CaptionStyleIntent[];
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
  readonly refinements: readonly TimedCaptionRefinement[];
  readonly wordIds?: readonly string[];
  readonly fields?: readonly CaptionFieldAssignment[];
};

export type TimedCaptionProjection = {
  readonly contract: "svml.timed-caption-projection@1";
  readonly text: string;
  readonly regions: readonly TimedCaptionRegion[];
};
