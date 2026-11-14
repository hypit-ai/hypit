/**
 * Compatibility names for the current Web adapter.
 *
 * The canonical transport-independent operation types belong to @hypit/nle-service;
 * Workbench does not own the NLE application protocol.
 */
import type { NlePictureLayout } from "@hypit/nle";

export type {
  NleInspectorScene,
  NleServiceApplicationState as NleWorkbenchApplicationState,
  NleServiceCanvasPatch as NleWorkbenchCanvasPatch,
  NleServiceComponentMediaInputEditRequest as NleWorkbenchComponentMediaInputEditRequest,
  NleServiceComponentMediaInputs as NleWorkbenchComponentMediaInputs,
  NleServiceExportProgress as NleWorkbenchExportProgress,
  NleServiceExportRequest as NleWorkbenchExportRequest,
  NleServiceExportState as NleWorkbenchExportState,
  NleServiceFileStatus as NleWorkbenchFileStatus,
  NleServiceMediaKind as NleWorkbenchMediaKind,
  NleServiceMediaPlacementRequest as NleWorkbenchMediaPlacementRequest,
  NleServiceMediaPlacementResponse as NleWorkbenchMediaPlacementResponse,
  NleServiceOperationPatch as NleWorkbenchOperationPatch,
  NleServiceOperationReceipt as NleWorkbenchOperationReceipt,
  NleServiceOperationResponse as NleWorkbenchOperationResponse,
  NleServiceOwnerPersistence as NleWorkbenchOwnerPersistence,
  NleServiceParameterEditRequest as NleWorkbenchParameterEditRequest,
  NleServicePersistence as NleWorkbenchPersistence,
  NleServiceProjectMediaView as NleWorkbenchProjectMediaView,
  NleServiceProjectMediaView as WorkbenchProjectMediaView,
  NleServiceProjectPatch as NleWorkbenchProjectPatch,
  NleServiceProjectionInvalidation as NleWorkbenchProjectionInvalidation,
  NleServiceReviewRequest as NleWorkbenchReviewRequest,
  NleServiceReviewState as NleWorkbenchReviewState,
  NleServiceSaveReceipt as NleWorkbenchSaveReceipt,
  NleServiceSaveRequest as NleWorkbenchSaveRequest,
  NleServiceSnapshot as NleWorkbenchSnapshot,
  NleServiceSpatialAuthoring as NleWorkbenchSpatialAuthoring,
  NleServiceSpatialCommandRequest as NleWorkbenchSpatialCommandRequest,
  NleServiceTimelinePatch as NleWorkbenchTimelinePatch,
  NleServiceTransactionRequest as NleWorkbenchTransactionRequest,
  NleServiceViewTransactionRequest as NleWorkbenchViewTransactionRequest,
} from "@hypit/nle-service";

/** Current pointer-gesture Web adapter; maps to NLE Service `spatial.edit/layout.replace`. */
export type NleWorkbenchSpatialEditRequest = {
  readonly revision: number;
  readonly item: string;
  readonly layout: NlePictureLayout;
};

export type WorkbenchErrorView = {
  readonly format: "hypit.workbench-error@1";
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly owner?: "project" | "view" | "feedback";
    readonly expectedRevision?: number;
    readonly actualRevision?: number;
    readonly observe?: string;
  };
};
