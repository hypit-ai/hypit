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

export type CanvasTimelineTarget = {
  readonly target: string;
  readonly document: string;
  readonly name: string;
  readonly composition: string;
  readonly compositions: readonly { readonly id: string; readonly name: string }[];
  readonly tracks: readonly { readonly id: string; readonly name: string; readonly kind: "picture" | "audio"; readonly enabled: boolean }[];
  readonly editRate: { readonly numerator: number; readonly denominator: number };
  readonly endFrame: number;
  readonly projectRevision: number;
  readonly viewRevision: number;
};

export type CanvasTimelinePlacement = {
  readonly kind: "place";
  readonly target: string;
  readonly request: string;
  readonly composition: string;
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
  readonly media: MediaReference;
  readonly track?: string;
  readonly atFrame: number;
  readonly durationFrames?: number;
  readonly insert?: boolean;
  readonly includeAudio?: boolean;
};

export type CanvasTimelineRequest =
  | { readonly kind: "documents" }
  | { readonly kind: "open"; readonly document: string; readonly view?: string }
  | { readonly kind: "select"; readonly target: string; readonly composition: string }
  | CanvasTimelinePlacement
  | { readonly kind: "close"; readonly target: string };

export type CanvasTimelinePlaced = {
  readonly kind: "placed";
  readonly composition: string;
  readonly item: string;
  readonly track: string;
  readonly saveIssue?: string;
};

export type CanvasTimelineResponse =
  | { readonly kind: "documents"; readonly paths: readonly string[] }
  | { readonly kind: "target"; readonly value: CanvasTimelineTarget }
  | CanvasTimelinePlaced
  | { readonly kind: "closed" };
