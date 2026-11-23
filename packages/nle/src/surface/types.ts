import type { NleSpatialEdit } from "../spatial-authoring.js";
import type { NleComponentValueEdit } from "../component-value-authoring.js";
import type { NleCommand, NleTransaction } from "../transaction.js";
import type { NleServiceSnapshot } from "../service.js";
import type {
  NleCanvasScene,
  NleInspectorScene,
  NleSpatialItemCapabilities,
  NleTimelineItemCapabilities,
  NleTimelineItemObservation,
  NleTimelineScene,
  NleTransitionInspectorScene,
} from "./projection-types.js";

/** Caller-owned state for one editing interaction. Track IDs are unique within the Project. */
export type NleEditingContext = {
  readonly activeComposition: string;
  readonly lockedTracks: ReadonlySet<string>;
};

export type NleEditingSurfaceStatus = {
  readonly projectRevision: number;
  readonly projectDirty: boolean;
  readonly projectHistory: { readonly canUndo: boolean; readonly canRedo: boolean };
};

export type NleEditingSurfaceOpen = {
  readonly status: NleEditingSurfaceStatus;
  readonly project: NleServiceSnapshot;
  readonly timelineCapabilities: readonly NleTimelineItemCapabilities[];
  readonly spatialCapabilities: readonly NleSpatialItemCapabilities[];
  readonly timeline: NleTimelineScene;
  readonly canvas: NleCanvasScene;
};

export type NleEditingSurfaceObservationRequest =
  | { readonly kind: "status" }
  | { readonly kind: "open"; readonly observations?: readonly NleTimelineItemObservation[] }
  | { readonly kind: "timeline"; readonly observations?: readonly NleTimelineItemObservation[] }
  | { readonly kind: "canvas"; readonly observations?: readonly NleTimelineItemObservation[] }
  | { readonly kind: "transition-inspector"; readonly transition: string }
  | {
      readonly kind: "inspector";
      readonly item: string;
      readonly observations?: readonly NleTimelineItemObservation[];
    };

export type NleEditingSurfaceObservation =
  | { readonly kind: "status"; readonly value: NleEditingSurfaceStatus }
  | { readonly kind: "open"; readonly value: NleEditingSurfaceOpen }
  | { readonly kind: "timeline"; readonly value: NleTimelineScene }
  | { readonly kind: "canvas"; readonly value: NleCanvasScene }
  | { readonly kind: "transition-inspector"; readonly value: NleTransitionInspectorScene }
  | { readonly kind: "inspector"; readonly value: NleInspectorScene };

type ProjectRevision = {
  readonly expectedProjectRevision: number;
};

export type NleEditingSurfaceCommand =
  | (ProjectRevision & {
      readonly kind: "project.transact";
      readonly commands: readonly NleCommand[];
    })
  | (ProjectRevision & {
      readonly kind: "inspector.edit";
      readonly item: string;
      readonly section: string;
      readonly field: string;
      readonly value: string | number | boolean;
    })
  | (ProjectRevision & {
      readonly kind: "inspector.invoke";
      readonly item: string;
      readonly section: string;
      readonly collection: string;
      readonly row: string;
      readonly action: string;
    })
  | (ProjectRevision & {
      readonly kind: "transition-inspector.edit";
      readonly transition: string;
      readonly section: string;
      readonly field: string;
      readonly value: string | number | boolean;
    })
  | (ProjectRevision & {
      readonly kind: "spatial.edit";
      readonly item: string;
      readonly edit: NleSpatialEdit;
    })
  | (ProjectRevision & {
      readonly kind: "component-value.edit";
      readonly item: string;
      readonly edit: NleComponentValueEdit;
    })
  | (ProjectRevision & { readonly kind: "project.undo" })
  | (ProjectRevision & { readonly kind: "project.redo" });

export type NleEditingSurfaceInvalidation =
  | "timeline"
  | "canvas"
  | "inspector"
  | "programme";

export type NleEditingSurfaceReceipt = {
  readonly status: NleEditingSurfaceStatus;
  readonly projectChanged: boolean;
  readonly invalidated: readonly NleEditingSurfaceInvalidation[];
};

export type NleEditingSurfaceChange = {
  readonly kind: string;
  readonly status: NleEditingSurfaceStatus;
};

export type NleEditingSurfaceListener = (change: NleEditingSurfaceChange) => void;

/** Convenience type for callers that already own a pure Project transaction. */
export type NleEditingSurfaceProjectTransaction = NleTransaction;
