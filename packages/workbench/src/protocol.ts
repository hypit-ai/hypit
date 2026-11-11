import type { NlePictureLayout, NleProject, NleTransaction } from "@hypit/nle";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";
import type {
  NleCanvasScene,
  NleTimelineScene,
  NleTimelineView,
  NleTimelineViewTransaction,
} from "@hypit/nle-view";

export type { NleInspectorScene } from "@hypit/nle-view";

export type NleWorkbenchMediaKind = "image" | "video" | "audio" | "unknown";

/** Host-derived presentation of one project Media Asset; never serialized into the NLE Project. */
export type WorkbenchProjectMediaView = {
  readonly id: string;
  readonly name: string;
  readonly asset: string;
  readonly kind: NleWorkbenchMediaKind;
  readonly mediaType?: string;
  readonly size?: number;
  readonly durationSeconds?: number;
  readonly width?: number;
  readonly height?: number;
  readonly hasAudio?: boolean;
  readonly resource?: string;
  readonly error?: string;
};

export type NleWorkbenchProjectMediaView = WorkbenchProjectMediaView & {
  readonly usedBy: number;
};

export type NleWorkbenchSnapshot = {
  readonly format: "hypit.workbench-nle@1";
  readonly project: NleProject;
  readonly view: NleTimelineView;
  readonly scene: NleTimelineScene;
  readonly canvasScene: NleCanvasScene;
  readonly mediaLibrary: {
    readonly generation: number;
    readonly assets: readonly NleWorkbenchProjectMediaView[];
  };
  readonly projectFile: string;
  readonly viewFile: string;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
};

export type NleWorkbenchViewTransactionRequest = {
  readonly transaction: NleTimelineViewTransaction;
};

export type NleWorkbenchTransactionRequest = {
  readonly label: string;
  readonly transaction: NleTransaction;
};

export type NleWorkbenchParameterEditRequest = {
  readonly revision: number;
  readonly item: string;
  readonly section: string;
  readonly field: string;
  readonly value: string | number | boolean;
};

export type NleWorkbenchSpatialEditRequest = {
  readonly revision: number;
  readonly item: string;
  readonly layout: NlePictureLayout;
};

export type NleWorkbenchMediaPlacementRequest = {
  readonly revision: number;
  /** Project-relative id from the current Media Library projection. */
  readonly media: string;
  readonly track: string;
  readonly at: ExactTemporalValue;
  /** Required only for constant-picture assets, which have no intrinsic time domain. */
  readonly duration?: ExactTemporalValue;
};

export type NleWorkbenchMediaPlacementResponse = {
  readonly snapshot: NleWorkbenchSnapshot;
  readonly item: string;
};

export type NleWorkbenchExportRequest = {
  readonly revision: number;
  /** File name only. The Workbench Host publishes it below the Project exports directory. */
  readonly fileName: string;
  readonly quality: "draft" | "standard" | "high";
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly resolution: { readonly width: number; readonly height: number };
};

export type NleWorkbenchExportProgress =
  | { readonly phase: "open" | "load-packages" | "lower" | "publish"; readonly state: "start" | "complete" }
  | { readonly phase: "media"; readonly completed: number; readonly total: number }
  | { readonly phase: "picture"; readonly state: "start" | "progress" | "complete"; readonly frames?: number }
  | { readonly phase: "audio" | "mux"; readonly state: "start" | "complete" };

export type NleWorkbenchExportState = {
  readonly format: "hypit.workbench-nle-export@1";
  readonly id: number;
  readonly state: "idle" | "running" | "complete" | "failed" | "cancelled";
  readonly progress?: NleWorkbenchExportProgress;
  readonly output?: {
    /** Portable path relative to the application Project Root. */
    readonly path: string;
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
    readonly frameCount: number;
    readonly canvas: { readonly width: number; readonly height: number };
  };
  readonly error?: string;
};

export type WorkbenchErrorView = {
  readonly format: "hypit.workbench-error@1";
  readonly error: { readonly name: string; readonly message: string };
};
