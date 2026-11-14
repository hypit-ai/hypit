import type {
  NleComponentMediaInputState,
  NleProject,
  NleSpatialEdit,
  NleTrack,
  NleTransaction,
} from "@hypit/nle";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type {
  NleCanvasScene,
  NleCanvasSceneLayer,
  NleTimelineScene,
  NleTimelineSceneTrack,
  NleTimelineView,
  NleTimelineViewTransaction,
  NleSpatialItemCapabilities,
} from "@hypit/nle-view";

export type { NleInspectorScene } from "@hypit/nle-view";

export type NleServiceMediaKind = "image" | "video" | "audio" | "unknown";

/** Service-derived presentation of one project Media Asset; never serialized into the NLE Project. */
export type NleServiceProjectMediaView = {
  readonly id: string;
  readonly name: string;
  readonly asset: string;
  readonly kind: NleServiceMediaKind;
  readonly mediaType?: string;
  readonly size?: number;
  readonly durationSeconds?: number;
  readonly width?: number;
  readonly height?: number;
  readonly hasAudio?: boolean;
  readonly resource?: string;
  readonly error?: string;
};

export type NleServiceOwnerPersistence =
  | { readonly state: "clean" | "dirty" | "saving" }
  | { readonly state: "conflict" | "failed"; readonly error: string };

export type NleServicePersistence = {
  readonly project: NleServiceOwnerPersistence;
  readonly view: NleServiceOwnerPersistence;
};

export type NleServiceSnapshot = {
  readonly format: "hypit.nle-service@1";
  readonly project: NleProject;
  readonly view: NleTimelineView;
  readonly scene: NleTimelineScene;
  readonly canvasScene: NleCanvasScene;
  /** Invocation-local derived Programme identity; independent of Project and View revisions. */
  readonly programmeGeneration: number;
  readonly mediaLibrary: {
    readonly generation: number;
    readonly assets: readonly NleServiceProjectMediaView[];
  };
  readonly projectFile: string;
  readonly viewFile: string;
  readonly dirty: boolean;
  readonly persistence: NleServicePersistence;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
};

export type NleServiceProjectionInvalidation =
  | "timeline"
  | "canvas"
  | "inspector"
  | "programme"
  | "item-preview"
  | "media-library";

export type NleServiceOperationReceipt = {
  readonly format: "hypit.nle-service-operation@1";
  readonly projectRevision: number;
  readonly viewRevision: number;
  readonly dirty: boolean;
  readonly history: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly undoLabel?: string;
    readonly redoLabel?: string;
  };
  readonly changed: {
    readonly project: boolean;
    readonly view: boolean;
    readonly tracks: readonly string[];
    readonly items: readonly string[];
  };
  readonly invalidated: readonly NleServiceProjectionInvalidation[];
  readonly programmeGeneration: number;
  readonly persistence: NleServicePersistence;
};

/** Stable-id author-fact patch. Collection order is explicit; omitted Tracks retain their prior value. */
export type NleServiceProjectPatch = Pick<
  NleProject,
  "revision" | "name" | "canvas" | "componentValues" | "pictureLayouts" | "transitions" | "mattes"
> & {
  readonly trackOrder: readonly string[];
  readonly tracks: readonly NleTrack[];
};

/** Stable-id Timeline projection patch. Omitted Tracks retain their prior projection. */
export type NleServiceTimelinePatch = {
  readonly maximumFrame: number;
  readonly trackOrder: readonly string[];
  readonly tracks: readonly NleTimelineSceneTrack[];
};

/** Stable-id Canvas projection patch. Omitted Layers retain their prior projection. */
export type NleServiceCanvasPatch = {
  readonly canvas: NleCanvasScene["canvas"];
  readonly layerOrder: readonly string[];
  readonly layers: readonly NleCanvasSceneLayer[];
};

export type NleServiceOperationPatch = {
  readonly project: NleServiceProjectPatch;
  /** Timeline View is intentionally finite and remains one owner-level replacement. */
  readonly view: NleTimelineView;
  readonly timeline: NleServiceTimelinePatch;
  readonly canvas: NleServiceCanvasPatch;
};

/**
 * Authoritative post-operation facts and projections. Open-only paths and the project Media catalog are omitted:
 * editing one NLE never changes the shared project asset collection.
 */
export type NleServiceOperationResponse = {
  readonly format: "hypit.nle-service-operation-response@1";
  readonly receipt: NleServiceOperationReceipt;
  readonly patch: NleServiceOperationPatch;
  readonly programmeGeneration: number;
  readonly dirty: boolean;
  readonly persistence: NleServicePersistence;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
};

export type NleServiceViewTransactionRequest = {
  readonly transaction: NleTimelineViewTransaction;
};

export type NleServiceSaveRequest = {
  readonly projectRevision: number;
  readonly viewRevision: number;
};

export type NleServiceSaveReceipt = {
  readonly format: "hypit.nle-service-save@1";
  readonly projectRevision: number;
  readonly viewRevision: number;
  readonly dirty: boolean;
  readonly persistence: NleServicePersistence;
};

export type NleServiceFileStatus = {
  readonly format: "hypit.nle-service-file-status@1";
  readonly changed: boolean;
  readonly dirty: boolean;
  readonly projectRevision: number;
  readonly viewRevision: number;
  readonly persistence: NleServicePersistence;
};

export type NleServiceTransactionRequest = {
  readonly label: string;
  readonly transaction: NleTransaction;
};

export type NleServiceParameterEditRequest = {
  readonly revision: number;
  readonly item: string;
  readonly section: string;
  readonly field: string;
  readonly value: string | number | boolean;
};

export type NleServiceComponentMediaInputs = {
  readonly format: "hypit.nle-service-component-media-inputs@1";
  readonly revision: number;
  readonly item: string;
  readonly inputs: readonly NleComponentMediaInputState[];
};

export type NleServiceComponentMediaInputEditRequest = {
  readonly revision: number;
  readonly item: string;
  readonly input: string;
  /** Project Media Library id; null explicitly removes the current selection. */
  readonly media: string | null;
};

/** Complete headless spatial ability. A product may expose only a cheaper direct-manipulation subset. */
export type NleServiceSpatialAuthoring = {
  readonly format: "hypit.nle-service-spatial-authoring@1";
  readonly revision: number;
  readonly items: readonly NleSpatialItemCapabilities[];
};

export type NleServiceSpatialCommandRequest = {
  readonly revision: number;
  readonly item: string;
  readonly edit: NleSpatialEdit;
};

export type NleServiceMediaPlacementRequest = {
  readonly revision: number;
  /** Project-relative id from the current Media Library projection. */
  readonly media: string;
  readonly track: string;
  readonly at: ExactTemporalValue;
  /** Required only for constant-picture assets, which have no intrinsic time domain. */
  readonly duration?: ExactTemporalValue;
};

export type NleServiceMediaPlacementResponse = {
  readonly operation: NleServiceOperationResponse;
  readonly item: string;
};

export type NleServiceExportRequest = {
  readonly revision: number;
  /** File name only. The application Host publishes it below the Project exports directory. */
  readonly fileName: string;
  /** Invocation-only Picture root; it is not part of the NLE Project. */
  readonly pictureTarget: "html" | "gpu-composition";
  readonly quality: "draft" | "standard" | "high";
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly resolution: { readonly width: number; readonly height: number };
};

export type NleServiceExportProgress =
  | { readonly phase: "open" | "load-packages" | "lower" | "publish"; readonly state: "start" | "complete" }
  | { readonly phase: "media"; readonly completed: number; readonly total: number }
  | { readonly phase: "picture"; readonly state: "start" | "progress" | "complete"; readonly frames?: number }
  | { readonly phase: "audio" | "mux"; readonly state: "start" | "complete" };

export type NleServiceExportState = {
  readonly format: "hypit.nle-service-export@1";
  readonly id: number;
  readonly revision?: number;
  readonly state: "idle" | "running" | "complete" | "failed" | "cancelled";
  readonly progress?: NleServiceExportProgress;
  readonly output?: {
    /** Portable path relative to the application Project Root. */
    readonly path: string;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly frameCount: number;
    readonly canvas: { readonly width: number; readonly height: number };
  };
  readonly error?: string;
};

export type NleServiceReviewRequest = {
  readonly revision: number;
  /** One directory name published below the Project reviews directory. */
  readonly directoryName: string;
  /** Absolute half-open interval on the selected output frame grid. */
  readonly range: { readonly startFrame: number; readonly endFrameExclusive: number };
  /** Strictly increasing absolute Programme frames contained by range. */
  readonly frames: readonly number[];
  readonly pictureTarget: "html" | "gpu-composition";
  readonly quality: "draft" | "standard" | "high";
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly resolution: { readonly width: number; readonly height: number };
};

export type NleServiceReviewState = {
  readonly format: "hypit.nle-service-review@1";
  readonly id: number;
  readonly revision?: number;
  readonly state: "idle" | "running" | "complete" | "failed" | "cancelled";
  readonly progress?: NleServiceExportProgress;
  readonly output?: {
    /** Portable directory path relative to the application Project Root. */
    readonly path: string;
    readonly video: string;
    readonly frames: readonly { readonly frame: number; readonly path: string }[];
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly programmeFrameCount: number;
    readonly reviewFrameCount: number;
    readonly range: { readonly startFrame: number; readonly endFrameExclusive: number };
    readonly canvas: { readonly width: number; readonly height: number };
  };
  readonly error?: string;
};

/** Invocation-local NLE application state projected to SSE, Desktop IPC or Agent Tool subscriptions. */
export type NleServiceApplicationState = {
  readonly format: "hypit.nle-service-application-state@1";
  readonly sequence: number;
  readonly projectRevision: number;
  readonly viewRevision: number;
  readonly dirty: boolean;
  readonly persistence: NleServicePersistence;
  readonly external: {
    readonly project: boolean;
    readonly view: boolean;
  };
  readonly export: NleServiceExportState;
  readonly review: NleServiceReviewState;
};

