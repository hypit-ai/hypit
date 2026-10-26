import type { ExactTemporalValue } from "@hypit/temporal";

export type NarrativeAlignmentToken = {
  readonly tokenId: string;
  readonly segmentId: string;
  readonly text: string;
  readonly startBoundaryId: string;
  readonly endBoundaryId: string;
};

/** Narrative boundary meaning located on one named source-local domain. */
export type NarrativeAlignment = {
  readonly narrativeId: string;
  readonly domainId: string;
  readonly segment: {
    readonly segmentId: string;
    readonly startBoundaryId: string;
    readonly endBoundaryId: string;
  };
  readonly tokens: readonly NarrativeAlignmentToken[];
  readonly boundaries: readonly { readonly id: string; readonly at: ExactTemporalValue }[];
};

/** One alignment after its domain-owned exact projection has erased its proof inputs. */
export type ProjectedNarrativeAlignment = {
  readonly narrativeId: string;
  readonly timelineId: string;
  readonly segment: NarrativeAlignment["segment"];
  readonly tokens: readonly NarrativeAlignmentToken[];
  readonly boundaries: readonly { readonly id: string; readonly frame: number }[];
};

/** Internal balanced aggregation value used by the author Surface. */
export type NarrativeProjectionParts = {
  readonly parts: readonly ProjectedNarrativeAlignment[];
};

export type NarrativeProjectionHeader = { readonly id: string };

/** Explicitly projects one Narrative's boundary facts onto one Timeline. */
export type NarrativeProjection = {
  readonly id: string;
  readonly narrativeId: string;
  readonly timelineId: string;
  readonly segments: readonly NarrativeAlignment["segment"][];
  readonly tokens: readonly NarrativeAlignmentToken[];
  readonly boundaries: readonly { readonly id: string; readonly frame: number }[];
};

/** Domain-owned request for one Narrative boundary projected into Timeline. */
export type NarrativeInstantSpec = {
  readonly id: string;
  readonly subjectId: string;
  readonly boundary: "start" | "end" | "cue";
};
