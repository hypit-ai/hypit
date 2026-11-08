import type { ExactTemporalValue, LocalTemporalDomain, TemporalMapRegion } from "@hypit/temporal/algebra";

export type CaptionWordAttribute = {
  readonly name: string;
  readonly value: string | number | boolean;
};

export type CaptionDisplayWord = {
  readonly separatorBefore: "" | " ";
  readonly id: string;
  readonly unitId: string;
  readonly text: string;
  readonly attributes: readonly CaptionWordAttribute[];
};

export type CaptionUnit = { readonly id: string; readonly wordIds: readonly string[] };

export type CaptionCue = {
  readonly id: string;
  readonly unitIds: readonly string[];
  readonly role?: string;
};

/** Display truth only; it owns no measured time, media identity or rendering behavior. */
export type CaptionDocument = {
  readonly id: string;
  readonly units: readonly CaptionUnit[];
  readonly words: readonly CaptionDisplayWord[];
  readonly cues: readonly CaptionCue[];
};

/** Exact Caption Unit timing in one source-local temporal domain. */
export type LocalCaptionTiming = {
  readonly documentId: string;
  readonly domain: LocalTemporalDomain;
  readonly units: readonly {
    readonly unitId: string;
    readonly regions: readonly TemporalMapRegion[];
  }[];
};

export type CaptionSelection =
  | { readonly kind: "all" }
  | { readonly kind: "cues"; readonly ids: readonly string[] }
  | { readonly kind: "units"; readonly ids: readonly string[] };

/** Complete direct Caption facts owned by one independently editable Cue block. */
export type CaptionCuePayload = {
  readonly documentId: string;
  readonly cueId: string;
  readonly role?: string;
  readonly words: readonly CaptionDisplayWord[];
  readonly units: readonly (CaptionUnit & {
    readonly start: ExactTemporalValue;
    readonly end: ExactTemporalValue;
  })[];
};
