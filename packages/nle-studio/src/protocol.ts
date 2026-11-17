import type {
  NleEditingSurfaceCommand,
  NleEditingSurfaceStatus,
} from "@hypit/nle/surface";
import type {
  NleCanvasScene,
  NleInspectorScene,
  NleTimelineScene,
} from "@hypit/nle/view";
import type { NlePictureLayout } from "@hypit/nle";
import type { HtmlVideoDeliveryProfile, HtmlVideoRenderer } from "@hypit/html-video";
import type { MediaResource } from "@hypit/media";

export type NleStudioMediaEntry = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio" | "audiovisual" | "unknown";
  readonly state: "available" | "missing" | "invalid";
  readonly mediaType?: string;
  readonly durationFrames?: number;
  readonly resource?: string;
  readonly diagnostic?: string;
};

export type NleStudioMediaProjection = {
  readonly entries: readonly NleStudioMediaEntry[];
};

export type NleStudioComponentCatalogEntry = {
  readonly package: string;
  readonly offering: string;
  readonly title: string;
  readonly category: "text" | "subtitle" | "graphic";
};

export type NleStudioAdjustCatalogEntry = {
  readonly package: string;
  readonly offering: string;
  readonly title: string;
  readonly medium: "picture" | "audio";
};

export type NleStudioTransitionCatalogEntry = {
  readonly package: string;
  readonly offering: string;
  readonly title: string;
};

export type NleStudioCatalogProjection = {
  readonly components: readonly NleStudioComponentCatalogEntry[];
  readonly adjusts: readonly NleStudioAdjustCatalogEntry[];
  readonly transitions: readonly NleStudioTransitionCatalogEntry[];
};

export type NleStudioPreviewProjection =
  | { readonly state: "unavailable" }
  | { readonly state: "idle" }
  | { readonly state: "pending"; readonly generation: string }
  | { readonly state: "ready"; readonly generation: string; readonly resource: string };

export type NleStudioDeliveryProjection = { readonly state: "available" | "unavailable" };

export type NleStudioTimelineProjection = {
  readonly scene: NleTimelineScene;
  readonly compositions: readonly { readonly id: string; readonly name: string }[];
  /** Active-Composition Media Items resolved to Project Media Catalog identities by the Product backend. */
  readonly itemMedia: readonly { readonly item: string; readonly media: string }[];
};

/** Complete finite projection used to open one NLE Studio Product Session. */
export type NleStudioOpenProjection = {
  readonly project: { readonly name: string; readonly document: string };
  readonly viewDocument:
    | { readonly persistence: "session" }
    | { readonly persistence: "document"; readonly path: string };
  readonly status: NleEditingSurfaceStatus;
  readonly timeline: NleStudioTimelineProjection;
  readonly canvas: NleCanvasScene;
  readonly media: NleStudioMediaProjection;
  readonly catalog: NleStudioCatalogProjection;
  readonly preview: NleStudioPreviewProjection;
  readonly delivery: NleStudioDeliveryProjection;
};

export type NleStudioObservationRequest =
  | { readonly kind: "open" }
  | { readonly kind: "status" }
  | { readonly kind: "timeline" }
  | { readonly kind: "canvas" }
  | { readonly kind: "inspector"; readonly item: string }
  | { readonly kind: "media" }
  | { readonly kind: "catalog" }
  | { readonly kind: "preview" }
  | { readonly kind: "delivery" };

export type NleStudioObservation =
  | { readonly kind: "open"; readonly value: NleStudioOpenProjection }
  | { readonly kind: "status"; readonly value: NleEditingSurfaceStatus }
  | { readonly kind: "timeline"; readonly value: NleStudioTimelineProjection }
  | { readonly kind: "canvas"; readonly value: NleCanvasScene }
  | { readonly kind: "inspector"; readonly value: NleInspectorScene }
  | { readonly kind: "media"; readonly value: NleStudioMediaProjection }
  | { readonly kind: "catalog"; readonly value: NleStudioCatalogProjection }
  | { readonly kind: "preview"; readonly value: NleStudioPreviewProjection }
  | { readonly kind: "delivery"; readonly value: NleStudioDeliveryProjection };

export type NleStudioInvalidation =
  | "timeline"
  | "canvas"
  | "inspector"
  | "media"
  | "catalog"
  | "preview"
  | "delivery";

export type NleStudioOperationReceipt = {
  readonly operation: string;
  readonly status: NleEditingSurfaceStatus;
  readonly changed: { readonly project: boolean; readonly view: boolean };
  readonly invalidated: readonly NleStudioInvalidation[];
  readonly result?: Readonly<Record<string, string | number | boolean>>;
};

export type NleStudioCommandRequest = {
  readonly command: NleEditingSurfaceCommand;
};

export type NleStudioMediaPlaceRequest = {
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
  readonly item: string;
  readonly reference: { readonly path: string };
  readonly composition: string;
  readonly track: string;
  readonly atFrame: number;
  readonly durationFrames?: number;
  readonly includeAudio?: boolean;
  readonly layout?: NlePictureLayout;
};

export type NleStudioComponentMaterializeRequest = {
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
  readonly package: string;
  readonly offering: string;
  readonly item: string;
  readonly composition: string;
  readonly track: string;
  readonly atFrame: number;
  readonly durationFrames?: number;
};

export type NleStudioAdjustMaterializeRequest = {
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
  readonly package: string;
  readonly offering: string;
  readonly item: string;
  readonly composition: string;
  readonly track: string;
  readonly atFrame: number;
  readonly durationFrames?: number;
};

export type NleStudioTransitionMaterializeRequest = {
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
  readonly package: string;
  readonly offering: string;
  readonly transition: string;
  readonly composition: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly durationFrames?: number;
};

/** One explicit export of the NLE document already opened by this Product Session. */
export type NleStudioDeliveryStartRequest = {
  readonly destination: string;
  readonly profile: HtmlVideoDeliveryProfile;
  readonly renderer?: HtmlVideoRenderer;
};

type NleStudioDeliveryObservationBase = { readonly handle: string; readonly progress: number };
export type NleStudioDeliveryObservation =
  | (NleStudioDeliveryObservationBase & { readonly state: "queued" | "running" })
  | (NleStudioDeliveryObservationBase & { readonly state: "complete"; readonly result: MediaResource })
  | (NleStudioDeliveryObservationBase & { readonly state: "failed"; readonly diagnostic: string })
  | (NleStudioDeliveryObservationBase & { readonly state: "cancelled" });

export type NleStudioErrorResponse = {
  readonly error: string;
};
