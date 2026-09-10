import type { CanonicalValue, SourceRange, StoredValue, TypeRef } from "@hypit/protocol";
import type { CaptionWordAttribute, Narrative, NarrativeMoment, NarrativeSegment, NarrativeSelection, NarrativeToken, NarrativeTurn } from "@hypit/narrative";

export type { CaptionWordAttribute, Narrative, SemanticAnchor } from "@hypit/narrative";

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
  /** Parser-local array position; omitted from the public Narrative value. */
  readonly index: number;
  readonly atoms: readonly ParsedAtom[];
  readonly range: SourceRange;
  /** Exact body range between the Segment tags, used only for source-preserving marker edits. */
  readonly contentRange: SourceRange;
  readonly selfClosing: boolean;
};

export type ParsedToken = NarrativeToken & {
  /** Parser-local positions used to create stable source anchor ids; omitted from Narrative. */
  readonly index: number;
  readonly segmentTokenIndex: number;
  readonly range: SourceRange;
  /** Writable word surface, including attached punctuation and display attributes. */
  readonly editRange: SourceRange;
};
export type ParsedTurn = NarrativeTurn & { readonly range: SourceRange };

export type ParsedSelection = Omit<NarrativeSelection, "narrativeId"> & {
  readonly open: { readonly affinity: Affinity; readonly boundary: MarkerBoundary; readonly range: SourceRange };
  readonly close: { readonly affinity: Affinity; readonly boundary: MarkerBoundary; readonly range: SourceRange };
};
export type ParsedMoment = Omit<NarrativeMoment, "narrativeId"> & {
  readonly affinity: Affinity;
  readonly boundary: MarkerBoundary;
  readonly range: SourceRange;
};

export type ParsedCaptionRegion = {
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly startToken: number;
  readonly endTokenExclusive: number;
  readonly kind: "identity" | "alias" | "hidden";
  /** Flat word attributes authored on the display side; indices address displayWordSurfaces(display). */
  readonly marks: readonly {
    readonly displayIndex: number;
    readonly attributes: readonly CaptionWordAttribute[];
  }[];
  readonly range: SourceRange;
};

export type ParsedNarrative = Omit<
  Narrative,
  "id" | "segments" | "tokens" | "turns" | "selections" | "moments"
> & {
  /** Exact Script body range, used only for source-preserving Program-boundary edits. */
  readonly sourceRange: SourceRange;
  readonly segments: readonly ParsedSegment[];
  readonly tokens: readonly ParsedToken[];
  readonly turns: readonly ParsedTurn[];
  readonly selections: readonly ParsedSelection[];
  readonly moments: readonly ParsedMoment[];
  /** Script-private renderings used to emit independent public Text values. */
  readonly serializations: {
    readonly dialogue: string;
    readonly speech: string;
  };
  readonly captionProjection: {
    readonly text: string;
    readonly regions: readonly ParsedCaptionRegion[];
    readonly breaks: readonly { readonly tokenIndex: number; readonly range: SourceRange }[];
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
  readonly identities: readonly {
    readonly namespace: TypeRef;
    readonly id: string;
  }[];
};
