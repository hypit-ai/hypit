import type { ExactTemporalValue, LocalTemporalDomain } from "@hypit/temporal";

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

/** Named source-local timing assembled from Alignments in one exact domain. */
export type NarrativeLocalTiming = {
  readonly id: string;
  readonly narrativeId: string;
  readonly domain: LocalTemporalDomain;
  readonly segments: readonly NarrativeAlignment["segment"][];
  readonly tokens: readonly NarrativeAlignmentToken[];
  readonly boundaries: readonly { readonly id: string; readonly at: ExactTemporalValue }[];
};

/** Internal balanced aggregation value used by the author declaration. */
export type NarrativeTimingParts = {
  readonly alignments: readonly NarrativeAlignment[];
};

export type NarrativeTimingHeader = { readonly id: string };
