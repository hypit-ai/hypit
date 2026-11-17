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
  NleViewCommand,
  NleViewServiceSnapshot,
} from "../view/index.js";

export type NleEditingSurfaceStatus = {
  readonly projectRevision: number;
  readonly viewRevision: number;
  readonly projectDirty: boolean;
  readonly viewDirty: boolean;
  readonly projectHistory: { readonly canUndo: boolean; readonly canRedo: boolean };
  readonly viewHistory: { readonly canUndo: boolean; readonly canRedo: boolean };
  readonly viewCompatibility: "compatible" | "stale";
};

export type NleEditingSurfaceOpen = {
  readonly status: NleEditingSurfaceStatus;
  readonly project: NleServiceSnapshot;
  readonly view: NleViewServiceSnapshot;
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

type ProjectAndViewRevision = {
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
};

export type NleEditingSurfaceCommand =
  | (ProjectAndViewRevision & {
      readonly kind: "project.transact";
      readonly commands: readonly NleCommand[];
    })
  | (ProjectAndViewRevision & {
      readonly kind: "view.transact";
      readonly commands: readonly NleViewCommand[];
    })
  | (ProjectAndViewRevision & {
      readonly kind: "inspector.edit";
      readonly item: string;
      readonly section: string;
      readonly field: string;
      readonly value: string | number | boolean;
    })
  | (ProjectAndViewRevision & {
      readonly kind: "inspector.invoke";
      readonly item: string;
      readonly section: string;
      readonly collection: string;
      readonly row: string;
      readonly action: string;
    })
  | (ProjectAndViewRevision & {
      readonly kind: "transition-inspector.edit";
      readonly transition: string;
      readonly section: string;
      readonly field: string;
      readonly value: string | number | boolean;
    })
  | (ProjectAndViewRevision & {
      readonly kind: "spatial.edit";
      readonly item: string;
      readonly edit: NleSpatialEdit;
    })
  | (ProjectAndViewRevision & {
      readonly kind: "component-value.edit";
      readonly item: string;
      readonly edit: NleComponentValueEdit;
    })
  | { readonly kind: "project.undo" | "project.redo"; readonly expectedProjectRevision: number }
  | { readonly kind: "view.undo" | "view.redo"; readonly expectedViewRevision: number }
  | (ProjectAndViewRevision & { readonly kind: "view.reconcile" });

export type NleEditingSurfaceInvalidation =
  | "timeline"
  | "canvas"
  | "inspector"
  | "programme";

export type NleEditingSurfaceReceipt = {
  readonly status: NleEditingSurfaceStatus;
  readonly changed: { readonly project: boolean; readonly view: boolean };
  readonly invalidated: readonly NleEditingSurfaceInvalidation[];
};

export type NleEditingSurfaceChange = {
  readonly owner: "project" | "view";
  readonly kind: string;
  readonly status: NleEditingSurfaceStatus;
};

export type NleEditingSurfaceListener = (change: NleEditingSurfaceChange) => void;

/** Convenience type for callers that already own a pure Project transaction. */
export type NleEditingSurfaceProjectTransaction = NleTransaction;
