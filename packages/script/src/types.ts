import type { CaptionDisplayWord, CaptionDocument } from "@hypit/caption";
import type { NarrativeCaptionBinding } from "@hypit/narrative-caption";
import type {
  Narrative,
  NarrativeMoment,
  NarrativeMomentRef,
  NarrativeSegment,
  NarrativeSegmentRef,
  NarrativeSelection,
  NarrativeSelectionRef,
  NarrativeToken,
  NarrativeTurn,
} from "@hypit/narrative";

export type { Narrative, SemanticAnchor } from "@hypit/narrative";

export type SourceRange = { readonly start: number; readonly end: number };

export type CaptionWordAttribute = CaptionDisplayWord["attributes"][number];

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
  /** Exact body range between Segment tags for Script-owned source edits and formatting. */
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
  readonly separatorBefore: "" | " ";
  readonly id: string;
  readonly display: string;
  readonly segmentId: string;
  readonly startToken: number;
  readonly endTokenExclusive: number;
  readonly kind: "identity" | "alias" | "hidden";
  /** Flat word attributes authored on the display side; indices address displaySurfaces(display). */
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
  /** Exact Script body range, used for source-preserving edits and comparisons. */
  readonly sourceRange: SourceRange;
  readonly segments: readonly ParsedSegment[];
  readonly tokens: readonly ParsedToken[];
  readonly turns: readonly ParsedTurn[];
  readonly selections: readonly ParsedSelection[];
  readonly moments: readonly ParsedMoment[];
  /** Script-private whole-file speech rendering used by explicit authoring queries. */
  readonly serializations: {
    readonly speech: string;
  };
  readonly captionProjection: {
    readonly text: string;
    readonly regions: readonly ParsedCaptionRegion[];
    readonly breaks: readonly { readonly tokenIndex: number; readonly range: SourceRange }[];
  };
};

/** Strongly typed, syntax-neutral facts projected from one Script file. */
export type ScriptProjection = {
  readonly narrative: Narrative;
  readonly segments: readonly NarrativeSegmentRef[];
  readonly selections: readonly NarrativeSelectionRef[];
  readonly moments: readonly NarrativeMomentRef[];
  readonly caption: {
    readonly document: CaptionDocument;
    readonly binding: NarrativeCaptionBinding;
  };
};
