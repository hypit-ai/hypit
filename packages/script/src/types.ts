import type { CanonicalValue, SourceRange, StoredValue, TypeRef } from "@svml/protocol";

export type Affinity = "left" | "right";

export type MarkerBoundary = {
  readonly tokenIndex: number;
  readonly structuralPosition: number;
  readonly segmentId?: string;
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

export type ParsedSegment = {
  readonly id: string;
  readonly index: number;
  readonly startAnchorId: string;
  readonly endAnchorId: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
  readonly atoms: readonly ParsedAtom[];
  readonly range: SourceRange;
  readonly selfClosing: boolean;
};

export type ParsedToken = {
  readonly id: string;
  readonly index: number;
  readonly segmentId: string;
  readonly segmentTokenIndex: number;
  readonly startAnchorId: string;
  readonly endAnchorId: string;
  readonly text: string;
  readonly normalized: string;
  readonly range: SourceRange;
};

export type ParsedTurn = {
  readonly id: string;
  readonly segmentId: string;
  readonly role?: string;
  readonly tokenStart: number;
  readonly tokenEndExclusive: number;
  readonly range: SourceRange;
};

export type ParsedSelectionOccurrence = {
  readonly occurrence: number;
  readonly open: {
    readonly affinity: Affinity;
    readonly boundary: MarkerBoundary;
    readonly range: SourceRange;
  };
  readonly close: {
    readonly affinity: Affinity;
    readonly boundary: MarkerBoundary;
    readonly range: SourceRange;
  };
};

export type ParsedSelection = {
  readonly id: string;
  readonly occurrences: readonly ParsedSelectionOccurrence[];
};

export type ParsedMomentOccurrence = {
  readonly occurrence: number;
  readonly affinity: Affinity;
  readonly boundary: MarkerBoundary;
  readonly range: SourceRange;
};

export type ParsedMoment = {
  readonly id: string;
  readonly occurrences: readonly ParsedMomentOccurrence[];
};

export type ParsedCaptionRefinement = {
  readonly id: string;
  readonly display: string;
  readonly displayStart: number;
  readonly displayEnd: number;
  readonly startToken: number;
  readonly endTokenExclusive: number;
  readonly relation: "exact";
};

export type ParsedCaptionRegion = {
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly startToken: number;
  readonly endTokenExclusive: number;
  readonly kind: "identity" | "alias" | "hidden";
  readonly refinements: readonly ParsedCaptionRefinement[];
  readonly range: SourceRange;
};

export type CaptionProjection = {
  readonly contract: "svml.caption-projection@0";
  readonly text: string;
  readonly regions: readonly ParsedCaptionRegion[];
};

export type SemanticAnchor = {
  readonly id: string;
  readonly kind: "segment-start" | "token-start" | "token-end" | "segment-end";
  readonly segmentId: string;
  readonly tokenId?: string;
  readonly segmentTokenIndex?: number;
};

export type ParsedNarrative = {
  readonly segments: readonly ParsedSegment[];
  readonly tokens: readonly ParsedToken[];
  readonly turns: readonly ParsedTurn[];
  readonly selections: readonly ParsedSelection[];
  readonly moments: readonly ParsedMoment[];
  readonly captionProjection: CaptionProjection;
  readonly semanticIndex: {
    readonly contract: "svml.semantic-index@0";
    readonly anchors: readonly SemanticAnchor[];
    readonly digest: string;
  };
  readonly serializations: {
    readonly dialogue: string;
    readonly speech: string;
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
  readonly sourceMaps: readonly CanonicalValue[];
};
