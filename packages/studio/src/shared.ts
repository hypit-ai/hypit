/**
 * The only module imported by both the Node interpreter and the browser. It
 * declares types alone so the browser never pulls a Node dependency through it.
 */

import type { FrameSpan } from "@hypit/timeline";

import type {
  Range,
  StudioItemDisplay,
  StudioIcon,
  StudioEditHandle,
  StudioLaneDescription,
  StudioInspectorField,
  StudioTemporalDomainAnchor,
  StudioTemporalDomainItem,
  StudioTemporalDomainView,
  StudioTemporalLineage,
  StudioTemporalMarker,
  StudioSourceLocation,
  StudioTimelineGesture,
  StudioTimelinePresentation,
  StudioTimelineTone,
  StudioTrackFamily,
} from "@hypit/studio-companion";
import type { CanonicalValue } from "@hypit/hypit/protocol";

export type {
  Range,
  StudioItemDisplay,
  StudioIcon,
  StudioEditHandle,
  StudioLaneDescription,
  StudioMaterialPreview,
  StudioInspectorField,
  StudioInspectorDomain,
  StudioTemporalLineage,
  StudioTemporalMarker,
  StudioSourceLocation,
  StudioTemporalProjection,
  StudioTemporalSource,
  StudioTimelinePresentation,
  StudioTimelineTone,
  StudioTrackFamily,
} from "@hypit/studio-companion";

/** Renderer addresses resolved privately by Studio from terminal spans. */
export type StudioTerminalTarget =
  | {
      readonly kind: "visual-present";
      readonly occurrencePath: readonly string[];
      readonly presentId: string;
      readonly elementId?: string;
    }
  | {
      readonly kind: "visual-adjustment";
      readonly occurrencePath: readonly string[];
      readonly adjustmentId: string;
    };


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
};

/** One terminal Track item projected onto Studio's shared timeline. */
export type StudioItem = FrameSpan & {
  /** Studio identity. Output-qualified so sibling Track Items cannot collide. */
  readonly id: string;
  /** The authored id this terminal item is named after, when it names one. */
  readonly authoredId: string;
  /** The exact package/domain Item that placed it, when one did. */
  readonly marker?: StudioTemporalMarker;
  readonly display: StudioItemDisplay;
  /** Where that authored tag was written. */
  readonly elementLocation?: StudioSourceLocation;
  readonly stackOrder: number;
  readonly presentation: StudioTimelinePresentation;
  readonly temporal?: StudioTemporalLineage;
  /** Studio-private renderer targets resolved from package-owned terminal links. */
  readonly terminalTargets: readonly StudioTerminalTarget[];
  /** Companion-selected writable fields; hidden source bindings never cross into this surface. */
  readonly inspector: readonly StudioInspectorField[];
  readonly editHandles: readonly StudioEditHandle[];
};

export type StudioInspectorObject = {
  readonly id: string;
  /** Package-owned grouping label, such as Presentation Rules. */
  readonly group: string;
  readonly title: string;
  readonly elementLocation?: StudioSourceLocation;
  readonly inspector: readonly StudioInspectorField[];
};

export type StudioTrack = {
  /** Exact LogicalOutput ref; labels are not identities. */
  readonly id: string;
  readonly label: string;
  /** Render order in the timeline; 0 is the top row. */
  readonly row: number;
  readonly items: readonly StudioItem[];
  /** Track-owned author objects that are rules or parameters, not timeline occurrences. */
  readonly inspectorObjects: readonly StudioInspectorObject[];
  readonly binding: StudioTrackBinding;
};

export type TemporalDomainAnchor = StudioTemporalDomainAnchor;
export type TemporalDomainItem = StudioTemporalDomainItem;
export type TemporalDomainView = StudioTemporalDomainView;

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
  /** The resolved picture plane. It is a preview snapshot, not another authored Canvas. */
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly clearColor: string;
  };
  /** The resolved playback domain. It is derived from the authored Timeline. */
  readonly timeline: {
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly frameCount: number;
    readonly durationSec: number;
  };
  readonly tracks: readonly StudioTrack[];
  /** Package-contributed temporal views projected onto the same absolute ruler. */
  readonly temporalDomains: readonly TemporalDomainView[];
  /** The Tracks, compiled into the document the renderer photographs. */
  readonly preview: { readonly kind: "html-program"; readonly srcdoc: string };
};

/** The complete author mutation vocabulary exposed by Studio. */
export type StudioMutation =
  | {
      readonly type: "timeline.adjust";
      readonly revision: number;
      readonly itemId: string;
      readonly gesture: StudioTimelineGesture;
      readonly target:
        | {
            readonly kind: "instant";
            readonly frame: number;
            readonly domain?: import("@hypit/studio-companion").StudioTemporalDomainEditTarget;
          }
        | (FrameSpan & {
            readonly kind: "window";
            readonly domain?: import("@hypit/studio-companion").StudioTemporalDomainEditTarget;
          });
    }
  | {
      readonly type: "parameter.adjust";
      readonly revision: number;
      readonly owner:
        | { readonly kind: "item"; readonly itemId: string }
        | { readonly kind: "track-object"; readonly trackId: string; readonly objectId: string };
      readonly parameterId: string;
      readonly value: CanonicalValue;
    };

export type StudioFailure = {
  readonly revision: number;
  readonly error: string;
  /** Points the code pane at the offending element when the interpreter knows it. */
  readonly range?: Range;
};
