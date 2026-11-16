import type { NleEditingSurfaceCommand, NleEditingSurfaceOpen } from "@hypit/nle/surface";
import type { NleInspectorScene } from "@hypit/nle/view";

export type NleStudioMediaEntry = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio" | "audiovisual";
  readonly resource?: string;
};

export type NleStudioMediaProjection = {
  readonly entries: readonly NleStudioMediaEntry[];
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
  readonly preview: NleStudioPreviewProjection;
};

export type NleStudioCommandRequest = {
  readonly command: NleEditingSurfaceCommand;
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
