/**
 * The only module imported by both the Node interpreter and the browser. It
 * declares types alone so the browser never pulls a Node dependency through it.
 */

import type {
  Range,
  StudioEntityDisplay,
  StudioIcon,
  StudioEditHandle,
  StudioLaneDescription,
  StudioMaterialPreview,
  StudioInspectorField,
  StudioInspectorDomain,
  StudioSemanticAnchor,
  StudioSemanticSegment,
  StudioSemanticTimeline,
  StudioSemanticToken,
  StudioTemporalLineage,
  StudioTemporalPhase,
  StudioTemporalProjection,
  StudioTemporalSource,
  StudioTimelineGesture,
  StudioTimelinePresentation,
  StudioTimelineTone,
  StudioTrackFamily,
} from "@hypit/studio-adapter";
import type { CanonicalValue } from "@hypit/protocol";

export type {
  Range,
  StudioEntityDisplay,
  StudioIcon,
  StudioEditHandle,
  StudioLaneDescription,
  StudioMaterialPreview,
  StudioInspectorField,
  StudioInspectorDomain,
  StudioTemporalLineage,
  StudioTemporalPhase,
  StudioTemporalProjection,
  StudioTemporalSource,
  StudioTimelinePresentation,
  StudioTimelineTone,
  StudioTrackFamily,
} from "@hypit/studio-adapter";

export type CandidateOrigin = "run" | "source" | "none";
export type CandidateStatus = "resolved" | "unresolved";


/** Studio-owned interpretation of a terminal projection. */
export type StudioTrackBinding = {
  readonly family: StudioTrackFamily;
  readonly tone: StudioTimelineTone;
  /** Studio-local lane name. This is presentation, not an authored identity. */
  readonly label?: string;
  readonly facet: "visual" | "audio";
  /** Visual/audio facets from one authored element share this identity. */
  readonly groupId: string;
  readonly icon: StudioIcon;
  /** Stable Studio-local Track Companion id; fallbacks remain explicit too. */
  readonly companion: string;
  /** Studio-local partition key for an attached projection. */
  readonly attachmentId?: string;
  readonly lane: StudioLaneDescription;
  readonly authoredTag?: string;
  readonly references: readonly { readonly name: string; readonly type: string }[];
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
  readonly display: StudioEntityDisplay;
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  /** Where that authored tag was written. */
  readonly elementRange?: Range;
  readonly stackOrder: number;
  readonly presentation: StudioTimelinePresentation;
  readonly temporal?: StudioTemporalLineage;
  /** Rendering identities implementing this author entity; optional for non-visual entities. */
  readonly renderIds: readonly string[];
  /** Companion-selected writable fields; hidden source bindings never cross into this surface. */
  readonly inspector: readonly StudioInspectorField[];
  readonly editHandles: readonly StudioEditHandle[];
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
  readonly companion: string;
  readonly narrativeId: string;
  readonly sourcePath: string;
  readonly range: Range;
  readonly content: Range;
  readonly selections: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
    /** How many Selections enclose this one. Nesting is what depth means. */
    readonly depth: number;
    readonly open: Range;
    readonly close: Range;
  }[];
  readonly segments: readonly {
    readonly id: string;
    /** Always 0: a Segment is the outermost range the Script declares. */
    readonly depth: number;
    readonly range: Range;
  }[];
  readonly moments: readonly {
    readonly id: string;
    readonly anchorId: string;
    readonly range: Range;
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

export type SemanticAnchor = StudioSemanticAnchor;

export type SemanticSegment = StudioSemanticSegment;

export type SemanticToken = StudioSemanticToken;

/** The semantic timebase projected from the compiled Narrative and its anchors. */
export type SemanticTimeline = StudioSemanticTimeline;

export type StudioSourceView = {
  /** Workspace-relative path. It is also the exact source write target. */
  readonly path: string;
  readonly text: string;
  readonly language: "svml" | "svs" | "svrun";
  readonly role: "run" | "author" | "dependency";
  readonly imports: readonly string[];
};

export type StudioTaskView = {
  readonly id: string;
  readonly title?: string;
  readonly note?: string;
  readonly highlightedOutputs?: readonly string[];
  readonly createdAt: number;
  readonly finishedAt?: number;
  readonly ongoing: boolean;
  readonly status: "queued" | "running" | "waiting" | "complete" | "failed" | "cancelled" | "saving-result" | "attention";
  readonly detail?: string;
  readonly requests?: { readonly total: number; readonly completed: number };
  readonly source: string;
  readonly run?: string;
  readonly targets: readonly string[];
  readonly operations: readonly {
    readonly status: "pending" | "completed" | "failed" | "cancelled";
    readonly phase?: string;
    readonly completed?: number;
    readonly total?: number;
    readonly unit?: string;
  }[];
};

export type StudioArtifactView = {
  readonly nameEditable?: boolean;
  /** Author-provided display name; the Output identifier remains unchanged. */
  readonly displayName?: string;
  /** File-owner identity; references to the same file share one card. */
  readonly id: string;
  readonly build: string;
  readonly createdAt: number;
  readonly output: string;
  readonly highlighted: boolean;
  readonly buildTitle?: string;
  readonly buildNote?: string;
  readonly ownerBuild?: string;
  readonly ownerOutput: string;
  readonly filePath: string;
  readonly size: number;
  readonly mediaType: string;
  readonly source: string;
  readonly run?: string;
  readonly origins: readonly { readonly build: string; readonly output: string; readonly run?: string; readonly source: string }[];
};

export type StudioLibraryRequest = {
  readonly media?: "image" | "video" | "audio";
  readonly section: "tasks" | "artifacts";
  readonly before?: string;
  readonly run?: string;
  readonly build?: string;
};

/** Read-only view of the Runtime context selected for this Studio environment. */
export type StudioLibraryView = {
  readonly section: StudioLibraryRequest["section"];
  readonly environment: string;
  readonly runtime?: string;
  /** Cursor for the next older page of immutable Build Results. */
  readonly next?: string;
  readonly tasks: readonly StudioTaskView[];
  readonly artifacts: readonly StudioArtifactView[];
};

export type StudioSnapshot = {
  readonly revision: number;
  readonly source: {
    /** Workspace-relative presentation path; the server retains the absolute write target. */
    readonly path: string;
    readonly text: string;
    /** The exact Run + Author closure; never a directory scan or inferred project tree. */
    readonly files: readonly StudioSourceView[];
  };
  /** Visible Run provenance; Studio never invents a second execution source. */
  readonly run: {
    readonly path: string;
    readonly targets: readonly string[];
    readonly satisfactions: readonly { readonly output: string; readonly candidate: string }[];
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
  readonly semantic?: SemanticTimeline;
  /** The Tracks, compiled into the document the renderer photographs. */
  readonly preview: { readonly kind: "hyperframes"; readonly srcdoc: string };
  readonly provenance: {
    /** Where the timeline came from. The frame domain always shares its source. */
    readonly timing: "measured" | "authored";
    readonly picture: "resolved";
    /** What the badges above are standing for, in one sentence. */
    readonly note: string;
  };
};

/** The complete author mutation vocabulary exposed by Studio. */
export type StudioMutation =
  | {
      readonly type: "timeline.adjust";
      readonly revision: number;
      readonly entityId: string;
      readonly gesture: StudioTimelineGesture;
      readonly target:
        | {
            readonly kind: "instant";
            readonly frame: number;
            readonly semantic?:
              | { readonly kind: "selection"; readonly startAnchorId: string; readonly endAnchorId: string }
              | { readonly kind: "moment"; readonly anchorId: string };
          }
        | {
            readonly kind: "window";
            readonly startFrame: number;
            readonly endFrameExclusive: number;
            readonly semantic?:
              | { readonly kind: "selection"; readonly startAnchorId: string; readonly endAnchorId: string }
              | { readonly kind: "moment"; readonly anchorId: string };
          };
    }
  | {
      readonly type: "parameter.adjust";
      readonly revision: number;
      readonly entityId: string;
      readonly parameterId: string;
      readonly value: CanonicalValue;
    };

export type StudioFailure = {
  readonly revision: number;
  readonly error: string;
  /** Points the code pane at the offending element when the interpreter knows it. */
  readonly range?: Range;
};
