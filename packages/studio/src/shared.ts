/**
 * The only module imported by both the Node interpreter and the browser. It
 * declares types alone so the browser never pulls a Node dependency through it.
 */

/** UTF-16 offsets into the exact source text carried by the snapshot. */
export type Range = { readonly start: number; readonly end: number };

export type CandidateOrigin = "run" | "source" | "none";
export type CandidateStatus = "resolved" | "unresolved";

/** Adapter-owned family id. Studio must not make third-party families edit this protocol. */
export type StudioTrackFamily = string;

export type StudioTimelinePresentation = {
  /** What one selectable box means, never how the renderer happened to split it. */
  readonly entity: string;
  readonly shape: string;
  readonly parentId?: string;
  readonly depth: number;
};

/** One semantic source that an authored component bound its timing to. */
export type StudioTemporalSource = {
  readonly kind: "program" | "selection" | "segment" | "moment" | "parent-schedule";
  readonly id?: string;
  /** Repeated Selection/Moment occurrences stay distinct when a component expands `each`. */
  readonly occurrenceId?: string;
};

/** The exact authored endpoint expressions and the frame window they projected to. */
export type StudioTemporalProjection = {
  readonly startExpression: string;
  readonly endExpression: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

export type StudioTemporalPhase = {
  readonly id: string;
  readonly label: string;
  readonly role: "preferred" | "active" | "settled" | "enter" | "body" | "exit";
  readonly startFrame: number;
  readonly endFrameExclusive: number;
};

/**
 * Studio's explanation of an entity's time. The Clip span remains the actual
 * consumption window; this value preserves how author and component arrived
 * there without pretending every layer is another Track item.
 */
export type StudioTemporalLineage = {
  readonly source: StudioTemporalSource;
  readonly projection?: StudioTemporalProjection;
  readonly phases: readonly StudioTemporalPhase[];
};

export type StudioInteraction = {
  readonly select: boolean;
  readonly seek: "start" | "pointer" | "none";
  readonly move: boolean;
  readonly trimStart: boolean;
  readonly trimEnd: boolean;
  readonly canvasTransform: boolean;
  readonly writeback: "source" | "none";
};

export type StudioLaneDescription = {
  readonly layout: "flat" | "nested";
  readonly boundFacets: boolean;
};

export type StudioInspectorSection =
  | "authoring"
  | "resolved"
  | "material"
  | "composition"
  | "identity"
  | "run";

export type StudioInspectorDescription = {
  readonly sections: readonly StudioInspectorSection[];
};

/** Studio-owned interpretation of a terminal projection. */
export type StudioTrackBinding = {
  readonly family: StudioTrackFamily;
  readonly facet: "visual" | "audio";
  /** Visual/audio facets from one authored element share this identity. */
  readonly groupId: string;
  readonly icon: string;
  /** Stable Studio-local adapter id; fallback adapters remain explicit too. */
  readonly adapter: string;
  readonly lane: StudioLaneDescription;
  readonly inspector: StudioInspectorDescription;
  readonly authoredTag?: string;
  readonly references: readonly { readonly name: string; readonly type: string }[];
  readonly interaction: StudioInteraction;
};

/**
 * The graph edge that made a Studio projection exist. This is deliberately
 * small: it identifies the Run output and candidate without pulling the whole
 * build graph or artifact history into the browser.
 */
export type CandidateProvenance = {
  readonly output: string;
  readonly outputRef?: string;
  readonly candidateId?: string;
  readonly origin: CandidateOrigin;
  readonly status: CandidateStatus;
  readonly errors: readonly string[];
};

/**
 * One Visual Present, which is the whole of what a Track says about a picture:
 * an identity, a span and where it sits in the stack. The box it paints into is
 * measured from the rendered picture rather than restated here, because motion
 * moves it and only the picture knows where it ended up.
 */
export type Clip = {
  /** Studio identity. Output-qualified so sibling Track clips cannot collide. */
  readonly id: string;
  /** Renderer identity, present only when this clip paints a Visual Present. */
  readonly presentId?: string;
  /** The authored id this Present is named after, when it names one. */
  readonly authoredId: string;
  /** The Script marker that placed it, when something said put it there. */
  readonly markerId?: string;
  readonly label: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  /** Where that authored tag was written. */
  readonly elementRange?: Range;
  readonly stackOrder: number;
  readonly presentation: StudioTimelinePresentation;
  readonly temporal?: StudioTemporalLineage;
  readonly interaction: StudioInteraction;
  /** Rendering identities implementing this author entity; optional for non-visual entities. */
  readonly renderIds: readonly string[];
};

export type Track = {
  /** Exact LogicalOutput ref; labels are not identities. */
  readonly id: string;
  readonly label: string;
  /** Render order in the timeline; 0 is the top row. */
  readonly row: number;
  readonly clips: readonly Clip[];
  readonly binding: StudioTrackBinding;
  /** Which resolved Run candidate produced this Track, or why it did not. */
  readonly provenance: CandidateProvenance;
};

export type ScriptMap = {
  readonly recordId: string;
  readonly range: Range;
  readonly selections: readonly {
    readonly id: string;
    /** How many Selections enclose this one. Nesting is what depth means. */
    readonly depth: number;
    readonly occurrences: readonly {
      readonly occurrence: number;
      readonly open: Range;
      readonly close: Range;
    }[];
  }[];
  readonly segments: readonly {
    readonly id: string;
    /** Always 0: a Segment is the outermost range the Script declares. */
    readonly depth: number;
    readonly range: Range;
  }[];
  readonly moments: readonly {
    readonly id: string;
    readonly occurrences: readonly { readonly occurrence: number; readonly range: Range }[];
  }[];
  /** Spoken words placed on the timeline by the selected semantic Candidate. */
  readonly tokens: readonly {
    readonly id: string;
    readonly range: Range;
    readonly startFrame: number;
    readonly endFrame: number;
  }[];
};

/** A semantic boundary that can be addressed by the timeline without guessing. */
export type SemanticAnchorKind =
  | "segment-start"
  | "segment-end"
  | "token-start"
  | "token-end";

export type SemanticAnchor = {
  readonly id: string;
  readonly kind: SemanticAnchorKind;
  readonly frame: number;
  readonly segmentId: string;
  readonly tokenId?: string;
};

export type SemanticSegment = {
  readonly id: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly range?: Range;
};

export type SemanticToken = {
  readonly id: string;
  readonly segmentId: string;
  readonly text: string;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly range?: Range;
};

/** The semantic timebase projected from the compiled Narrative and its anchors. */
export type SemanticTimeline = {
  readonly anchors: readonly SemanticAnchor[];
  readonly segments: readonly SemanticSegment[];
  readonly tokens: readonly SemanticToken[];
  readonly selections: readonly {
    readonly id: string;
    readonly occurrence: number;
    readonly occurrenceId: string;
    readonly startFrame: number;
    readonly endFrameExclusive: number;
  }[];
  readonly moments: readonly {
    readonly id: string;
    readonly occurrence: number;
    readonly occurrenceId: string;
    readonly frame: number;
  }[];
  /** The SemanticTrack candidate that supplied these frame anchors. */
  readonly provenance: CandidateProvenance;
};

export type StudioSnapshot = {
  readonly revision: number;
  readonly source: {
    /** Workspace-relative presentation path; the server retains the absolute write target. */
    readonly path: string;
    readonly text: string;
  };
  readonly script?: ScriptMap;
  readonly space: {
    readonly canvasWidth: number;
    readonly canvasHeight: number;
    readonly clearColor: string;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly frameCount: number;
    readonly durationSec: number;
  };
  readonly tracks: readonly Track[];
  /**
   * The special Studio lane. This is not another VisualTrack: it is the
   * Narrative's segment/word geometry projected onto the same frame domain.
   */
  readonly semantic: SemanticTimeline;
  /**
   * The picture, ready to mount. Real material is the base layer rather than the
   * whole picture: the Tracks above it have not been rendered into that file, so
   * they are composited over it exactly as they are in `hyperframes` mode.
   */
  /** The Tracks, compiled into the document the renderer photographs. */
  readonly preview: { readonly kind: "hyperframes"; readonly srcdoc: string };
  readonly provenance: {
    /** Where the timeline came from. The frame domain always shares its source. */
    readonly timing: "measured";
    readonly picture: "measured";
    /** What the badges above are standing for, in one sentence. */
    readonly note: string;
  };
};

export type StudioFailure = {
  readonly revision: number;
  readonly error: string;
  /** Points the code pane at the offending element when the interpreter knows it. */
  readonly range?: Range;
};
