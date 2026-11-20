import type { CanvasSelection, CanvasTransaction, MediaReference } from "@hypit/canvas";
import type {
  CanvasAdoptionRequest, CanvasInvokeRequest, CanvasModel, CanvasObservation, CanvasQuoteRequest, NodeCanvas,
} from "@hypit/canvas/node";
import type { InvocationAddress } from "@hypit/execution";

export type {
  CanvasAdoptionRequest, CanvasInvokeRequest, CanvasModel, CanvasObservation, CanvasQuoteRequest, CanvasTransaction,
};

export const canvasStudioProduct = "hypit.canvas-studio";

export type CanvasLaunch = { readonly document: string };
export type CanvasObservationRequest =
  | { readonly kind: "board" | "catalog" }
  | { readonly kind: "node" | "history"; readonly node: string };
export type CanvasCancelRequest = { readonly node: string; readonly address: InvocationAddress };
export type CanvasPreviewRequest =
  | { readonly node: string; readonly selection?: CanvasSelection }
  | { readonly media: MediaReference };

export type CanvasCommandReceipt = Awaited<ReturnType<NodeCanvas["transact"]>>;
export type CanvasQuoteReceipt = Awaited<ReturnType<NodeCanvas["quote"]>>;
export type CanvasInvokeReceipt = Awaited<ReturnType<NodeCanvas["invoke"]>>;
export type CanvasAdoptionReceipt = Awaited<ReturnType<NodeCanvas["adopt"]>>;
export type CanvasCancelReceipt = Awaited<ReturnType<NodeCanvas["cancel"]>>;
export type CanvasPreviewReceipt = { readonly token: string; readonly mediaType: string };
export type CanvasStudioEvent = { readonly kind: "canvas"; readonly revision: string } | { readonly kind: "media" };
