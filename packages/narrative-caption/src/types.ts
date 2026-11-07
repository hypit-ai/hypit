/** Explicit relation from source-neutral Caption units to Narrative Token identities. */
export type NarrativeCaptionBinding = {
  readonly id: string;
  readonly narrativeId: string;
  readonly documentId: string;
  readonly units: readonly { readonly unitId: string; readonly sourceTokenIds: readonly string[] }[];
};

export type NarrativeCaptionUnitSubset = {
  readonly documentId: string;
  readonly unitIds: readonly string[];
};
