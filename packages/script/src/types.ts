import type { CanonicalValue, SourceRange, StoredValue, TypeRef } from "@narratage/protocol";
import type { Narrative, NarrativeMomentOccurrence, NarrativeSegment, NarrativeSelectionOccurrence, NarrativeToken, NarrativeTurn } from "@narratage/narrative";

export type { Narrative, SemanticAnchor } from "@narratage/narrative";

export type Affinity = "left" | "right";

/** Script-only source structure. Public Selection/Moment values expose only resolved anchors. */
export type MarkerBoundary = {
  readonly tokenIndex: number;
  readonly structuralPosition: number;
  readonly segmentId?: string;
  readonly anchorId: string;
};

export type ParsedTextAtom = {
  readonly kind: "text";
  readonly speech: string;
  readonly caption: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
  readonly range: SourceRange;
};

export type ParsedRoleAtom = {
  readonly kind: "role";
  readonly label: string;
  readonly range: SourceRange;
};

export type ParsedAtom = ParsedTextAtom | ParsedRoleAtom;

export type ParsedSegment = NarrativeSegment & {
  readonly atoms: readonly ParsedAtom[];
  readonly range: SourceRange;
  readonly selfClosing: boolean;
};

export type ParsedToken = NarrativeToken & { readonly range: SourceRange };
export type ParsedTurn = NarrativeTurn & { readonly range: SourceRange };

export type ParsedSelectionOccurrence = NarrativeSelectionOccurrence & {
  readonly open: { readonly affinity: Affinity; readonly boundary: MarkerBoundary; readonly range: SourceRange };
  readonly close: { readonly affinity: Affinity; readonly boundary: MarkerBoundary; readonly range: SourceRange };
};

export type ParsedSelection = {
  readonly id: string;
  readonly occurrences: readonly ParsedSelectionOccurrence[];
};

export type ParsedMomentOccurrence = NarrativeMomentOccurrence & {
  readonly affinity: Affinity;
  readonly boundary: MarkerBoundary;
  readonly range: SourceRange;
};
export type ParsedMoment = {
  readonly id: string;
  readonly occurrences: readonly ParsedMomentOccurrence[];
};

export type ParsedCaptionRegion = {
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly startToken: number;
  readonly endTokenExclusive: number;
  readonly kind: "identity" | "alias" | "hidden";
  readonly range: SourceRange;
};

export type ParsedNarrative = Omit<
  Narrative,
  "segments" | "tokens" | "turns" | "selections" | "moments"
> & {
  readonly segments: readonly ParsedSegment[];
  readonly tokens: readonly ParsedToken[];
  readonly turns: readonly ParsedTurn[];
  readonly selections: readonly ParsedSelection[];
  readonly moments: readonly ParsedMoment[];
  readonly captionProjection: {
    readonly text: string;
    readonly regions: readonly ParsedCaptionRegion[];
  };
};

export type ScriptSurfaceRecordDraft = {
  readonly id: string;
  readonly type: TypeRef;
  readonly value: StoredValue;
  readonly range: SourceRange;
};

export type ScriptSurfaceInput = {
  readonly sourceName: string;
  readonly source: string;
  readonly tag: string;
  readonly openingStart: number;
  readonly contentStart: number;
  readonly attributes: Readonly<Record<string, string | CanonicalValue>>;
};

export type ScriptSurfaceOutput = {
  readonly nextOffset: number;
  readonly records: readonly ScriptSurfaceRecordDraft[];
  /** Script is a record-only Surface; it cannot smuggle executable graph declarations. */
  readonly components: readonly never[];
  readonly fragments: readonly never[];
  readonly sourceMaps: readonly CanonicalValue[];
};
