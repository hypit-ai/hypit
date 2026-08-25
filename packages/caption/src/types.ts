import type { CanonicalValue } from "@hypit/protocol";

export type CaptionStyleIntent = {
  readonly id: string;
  readonly rendering: {
    readonly family: string;
    readonly parameters: CanonicalValue;
  };
};

export type CaptionStyleApplication = {
  readonly id: string;
  readonly unitIds: readonly string[];
  readonly style: CaptionStyleIntent;
};

export type CaptionWordStyleApplication = {
  readonly id: string;
  readonly attribute: string;
  readonly wordIds: readonly string[];
  readonly style: CaptionStyleIntent;
};

export type CaptionMuteApplication = {
  readonly id: string;
  readonly unitIds: readonly string[];
};

export type CaptionProgramRun = {
  readonly id: string;
  readonly styleId: string;
  readonly unitIds: readonly string[];
};

export type CaptionProgramWordRun = {
  readonly id: string;
  readonly styleId: string;
  readonly wordIds: readonly string[];
};

export type CaptionProgram = {
  readonly id: string;
  readonly documentId: string;
  readonly styles: readonly CaptionStyleIntent[];
  readonly runs: readonly CaptionProgramRun[];
  /** Optional local word styles resolved from Script-native word attributes. */
  readonly wordRuns: readonly CaptionProgramWordRun[];
  readonly mutedUnitIds: readonly string[];
};

export type TimedCaptionUnit = {
  readonly unitId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type TimedCaptionCue = {
  readonly id: string;
  readonly styleId: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly units: readonly TimedCaptionUnit[];
};

export type TimedCaptionProjection = {
  /** Semantic ProgramSpace from which every unit frame was measured. */
  readonly spaceId: string;
  readonly narrativeId: string;
  readonly documentId: string;
  readonly cues: readonly TimedCaptionCue[];
};
