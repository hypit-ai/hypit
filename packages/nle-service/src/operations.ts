import type { NleInspectorScene, NleTimelineScene, NleCanvasScene } from "@hypit/nle-view";

import type {
  NleServiceApplicationState,
  NleServiceComponentMediaInputEditRequest,
  NleServiceComponentMediaInputs,
  NleServiceExportRequest,
  NleServiceExportState,
  NleServiceFileStatus,
  NleServiceMediaPlacementRequest,
  NleServiceMediaPlacementResponse,
  NleServiceOperationResponse,
  NleServiceParameterEditRequest,
  NleServiceReviewRequest,
  NleServiceReviewState,
  NleServiceSaveReceipt,
  NleServiceSaveRequest,
  NleServiceSnapshot,
  NleServiceSpatialAuthoring,
  NleServiceSpatialCommandRequest,
  NleServiceTransactionRequest,
  NleServiceViewTransactionRequest,
} from "./protocol.js";

/** Finite read requests shared by Agent Tool, Desktop IPC and Web adapters. */
export type NleServiceObservationRequest =
  | { readonly kind: "snapshot" }
  | { readonly kind: "timeline" }
  | { readonly kind: "canvas" }
  | { readonly kind: "application-state" }
  | { readonly kind: "file-status" }
  | { readonly kind: "spatial-authoring" }
  | { readonly kind: "component-media-inputs"; readonly item: string }
  | { readonly kind: "inspector"; readonly item: string }
  | { readonly kind: "export-state" }
  | { readonly kind: "review-state" };

export type NleServiceObservationResult =
  | { readonly kind: "snapshot"; readonly value: NleServiceSnapshot }
  | { readonly kind: "timeline"; readonly value: NleTimelineScene }
  | { readonly kind: "canvas"; readonly value: NleCanvasScene }
  | { readonly kind: "application-state"; readonly value: NleServiceApplicationState }
  | { readonly kind: "file-status"; readonly value: NleServiceFileStatus }
  | { readonly kind: "spatial-authoring"; readonly value: NleServiceSpatialAuthoring }
  | { readonly kind: "component-media-inputs"; readonly value: NleServiceComponentMediaInputs }
  | { readonly kind: "inspector"; readonly value: NleInspectorScene }
  | { readonly kind: "export-state"; readonly value: NleServiceExportState }
  | { readonly kind: "review-state"; readonly value: NleServiceReviewState };

/** Finite accepted state changes. No command accepts a file path or arbitrary JSON patch. */
export type NleServiceCommandRequest =
  | { readonly kind: "project.transaction"; readonly input: NleServiceTransactionRequest }
  | { readonly kind: "view.transaction"; readonly input: NleServiceViewTransactionRequest }
  | { readonly kind: "parameter.edit"; readonly input: NleServiceParameterEditRequest }
  | { readonly kind: "component-media-input.edit"; readonly input: NleServiceComponentMediaInputEditRequest }
  | { readonly kind: "spatial.edit"; readonly input: NleServiceSpatialCommandRequest }
  | { readonly kind: "media.place"; readonly input: NleServiceMediaPlacementRequest }
  | { readonly kind: "media.refresh" }
  | { readonly kind: "history.undo" }
  | { readonly kind: "history.redo" }
  | { readonly kind: "document.save"; readonly input: NleServiceSaveRequest }
  | { readonly kind: "document.reload" };

export type NleServiceCommandResult =
  | { readonly kind: "operation"; readonly value: NleServiceOperationResponse }
  | { readonly kind: "media-placement"; readonly value: NleServiceMediaPlacementResponse }
  | { readonly kind: "snapshot"; readonly value: NleServiceSnapshot }
  | { readonly kind: "save"; readonly value: NleServiceSaveReceipt };

/** Long-running or cancellable work remains separate from ordinary author-fact commands. */
export type NleServiceActionRequest =
  | { readonly kind: "export.start"; readonly input: NleServiceExportRequest }
  | { readonly kind: "export.cancel" }
  | { readonly kind: "review.start"; readonly input: NleServiceReviewRequest }
  | { readonly kind: "review.cancel" };

export type NleServiceActionResult =
  | { readonly kind: "export"; readonly value: NleServiceExportState }
  | { readonly kind: "review"; readonly value: NleServiceReviewState };

/** Structural application port; transports project this interface instead of invoking one another. */
export type NleServiceOperations = {
  observe(request: NleServiceObservationRequest): Promise<NleServiceObservationResult>;
  command(request: NleServiceCommandRequest): Promise<NleServiceCommandResult>;
  action(request: NleServiceActionRequest): Promise<NleServiceActionResult>;
};
