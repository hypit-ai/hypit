
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
  readonly runs: readonly CaptionPlannedRun[];
};

export type CaptionStyleIntent = {
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

/** Total, ordered style assignment plus an explicit post-planning visibility mask. */
export type CaptionProgram = {
  readonly id: string;
  readonly displaySequenceId: string;
  readonly styles: readonly CaptionStyleIntent[];
  readonly runs: readonly CaptionProgramRun[];
  /** Ordered display-word ids hidden by the renderer. They remain present in CaptionPlan. */
  readonly mutedWordIds: readonly string[];
};

export type TimedCaptionCue = {
  readonly id: string;
  readonly styleId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  /** Only whole-Atom timing is proven. No display-word timing exists here. */
  readonly atoms: readonly {
    readonly atomId: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
  }[];
  readonly fields: readonly CaptionFieldAssignment[];
};

export type TimedCaptionProjection = {
  readonly displaySequenceId: string;
  readonly cues: readonly TimedCaptionCue[];
};
