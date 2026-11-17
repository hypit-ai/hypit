import type { NleEditingSurfaceCommand, NleEditingSurfaceOpen } from "@hypit/nle/surface";
import type { NleInspectorScene } from "@hypit/nle/view";
import type { NlePictureLayout } from "@hypit/nle";

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

export type NleStudioSession = {
  readonly projectDocument: { readonly path: string };
  readonly viewDocument:
    | { readonly persistence: "session" }
    | { readonly persistence: "document"; readonly path: string };
  readonly open: NleEditingSurfaceOpen;
  readonly media: NleStudioMediaProjection;
  readonly catalog: NleStudioCatalogProjection;
  readonly preview: NleStudioPreviewProjection;
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

export type NleStudioInspectorRequest = {
  readonly item: string;
};

export type NleStudioInspectorResponse = {
  readonly inspector: NleInspectorScene;
};

export type NleStudioErrorResponse = {
  readonly error: string;
};
