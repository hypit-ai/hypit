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
      readonly kind: "visual-process";
      readonly occurrencePath: readonly string[];
      readonly processId: string;
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
  /** Visual/audio facets from one compiled author element share this identity. */
  readonly group: StudioTrackGroup;
  readonly icon: StudioIcon;
  /** Stable Studio-local Track Companion id; fallbacks remain explicit too. */
  readonly companion: string;
  /** Studio-local partition key for an attached projection. */
  readonly attachmentId?: string;
  readonly lane: StudioLaneDescription;
};

export type StudioTrackGroup =
  | { readonly kind: "author-element"; readonly element: string }
  | { readonly kind: "output"; readonly output: string };

export type StudioTrackAddress = {
  readonly output: string;
  readonly attachment?: string;
};

export type StudioItemAddress = {
  readonly track: StudioTrackAddress;
  readonly item: string;
};

export function sameStudioTrackAddress(left: StudioTrackAddress, right: StudioTrackAddress): boolean {
  return left.output === right.output && left.attachment === right.attachment;
}

export function sameStudioItemAddress(left: StudioItemAddress, right: StudioItemAddress): boolean {
  return sameStudioTrackAddress(left.track, right.track) && left.item === right.item;
}

/** Browser-local collection key; the public identity remains the structured address. */
export function studioItemAddressKey(address: StudioItemAddress): string {
  const attachment = address.track.attachment ?? "";
  return `${address.track.output.length}:${address.track.output}${attachment.length}:${attachment}${address.item.length}:${address.item}`;
}

export function sameStudioTrackGroup(left: StudioTrackGroup, right: StudioTrackGroup): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "author-element"
    ? left.element === (right as Extract<StudioTrackGroup, { readonly kind: "author-element" }>).element
    : left.output === (right as Extract<StudioTrackGroup, { readonly kind: "output" }>).output;
}

/** One terminal Track item projected onto Studio's shared timeline. */
export type StudioItem = FrameSpan & {
  /** Companion-local identity inside the owning Track. */
  readonly id: string;
  /** Structured address used whenever an Item crosses its Track boundary. */
  readonly address: StudioItemAddress;
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
  /** Exact LogicalOutput plus optional Companion-local attachment. */
  readonly address: StudioTrackAddress;
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
  readonly language: "svml" | "svs";
  readonly role: "author" | "dependency";
  readonly imports: readonly string[];
};

export type StudioTaskView = {
  readonly id: string;
  readonly createdAt: number;
  readonly finishedAt?: number;
  readonly ongoing: boolean;
  readonly status: "queued" | "running" | "waiting" | "complete" | "failed" | "cancelled" | "saving-result" | "attention";
  readonly detail?: string;
  readonly requests?: { readonly total: number; readonly completed: number };
  readonly source: string;
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
  /** File identity inside one Result; references to the same file share one card. */
  readonly id: string;
  readonly build: string;
  readonly createdAt: number;
  readonly output: string;
  readonly filePath: string;
  readonly size: number;
  readonly mediaType: string;
  readonly source: string;
  readonly origins: readonly {
    readonly build: string;
    readonly output: string;
    readonly source: string;
  }[];
};

export type StudioLibraryRequest = {
  readonly media?: "image" | "video" | "audio";
  readonly section: "tasks" | "artifacts";
  readonly before?: string;
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
    /** The exact Author closure; never a directory scan or inferred project tree. */
    readonly files: readonly StudioSourceView[];
  };
  /** Explicit Targets selected for this Studio session. */
  readonly selection: {
    readonly targets: readonly string[];
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
      readonly item: StudioItemAddress;
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
        | { readonly kind: "item"; readonly item: StudioItemAddress }
        | { readonly kind: "track-object"; readonly track: StudioTrackAddress; readonly objectId: string };
      readonly parameterId: string;
      readonly value: CanonicalValue;
    };

export type StudioFailure = {
  readonly revision: number;
  readonly error: string;
  /** Points the code pane at the offending element when the interpreter knows it. */
  readonly range?: Range;
};
