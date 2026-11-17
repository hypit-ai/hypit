import type {
  NleEditingSurfaceCommand,
  NleEditingSurfaceStatus,
} from "@hypit/nle/surface";
import type {
  NleCanvasScene,
  NleComponentMediaInput,
  NleInspectorScene,
  NleTimelineScene,
} from "@hypit/nle/view";
import type { HtmlVideoDeliveryProfile, HtmlVideoRenderer } from "@hypit/html-video";
import type { NlePictureLayout } from "@hypit/nle";

export type NleStudioMediaEntry = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio" | "audiovisual" | "unknown";
  readonly state: "available" | "missing" | "invalid";
  readonly mediaType?: string;
  readonly pictureKind?: "constant" | "signal";
  readonly durationFrames?: number;
  readonly resource?: string;
  readonly diagnostic?: string;
};

export type NleStudioComponentInputsProjection = {
  readonly item: string;
  readonly editable: boolean;
  readonly inputs: readonly (NleComponentMediaInput & { readonly media?: string })[];
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
  | { readonly state: "available"; readonly playback: boolean; readonly generation: number };

export type NleStudioDeliveryProjection = { readonly state: "available" | "unavailable" };

export type NleStudioClipboardProjection = {
  readonly items: number;
  readonly groups: number;
  readonly pendingGroups: number;
};

export type NleStudioTimelineProjection = {
  readonly scene: NleTimelineScene;
  readonly canReturn: boolean;
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
  readonly clipboard: NleStudioClipboardProjection;
};

export type NleStudioObservationRequest =
  | { readonly kind: "open" }
  | { readonly kind: "project" }
  | { readonly kind: "status" }
  | { readonly kind: "timeline" }
  | { readonly kind: "canvas" }
  | { readonly kind: "inspector"; readonly item: string }
  | { readonly kind: "component-inputs"; readonly item: string }
  | { readonly kind: "media" }
  | { readonly kind: "catalog" }
  | { readonly kind: "preview" }
  | { readonly kind: "delivery" }
  | { readonly kind: "action"; readonly handle: string }
  | { readonly kind: "clipboard" };

export type NleStudioObservation =
  | { readonly kind: "open"; readonly value: NleStudioOpenProjection }
  | { readonly kind: "project"; readonly value: NleStudioOpenProjection["project"] }
  | { readonly kind: "status"; readonly value: NleEditingSurfaceStatus }
  | { readonly kind: "timeline"; readonly value: NleStudioTimelineProjection }
  | { readonly kind: "canvas"; readonly value: NleCanvasScene }
  | { readonly kind: "inspector"; readonly value: NleInspectorScene }
  | { readonly kind: "component-inputs"; readonly value: NleStudioComponentInputsProjection }
  | { readonly kind: "media"; readonly value: NleStudioMediaProjection }
  | { readonly kind: "catalog"; readonly value: NleStudioCatalogProjection }
  | { readonly kind: "preview"; readonly value: NleStudioPreviewProjection }
  | { readonly kind: "delivery"; readonly value: NleStudioDeliveryProjection }
  | { readonly kind: "action"; readonly value: NleStudioActionObservation }
  | { readonly kind: "clipboard"; readonly value: NleStudioClipboardProjection };

export type NleStudioInvalidation =
  | "project"
  | "timeline"
  | "canvas"
  | "inspector"
  | "media"
  | "catalog"
  | "preview"
  | "delivery"
  | "clipboard";

export type NleStudioOperationReceipt = {
  readonly operation: string;
  readonly status: NleEditingSurfaceStatus;
  readonly changed: { readonly project: boolean; readonly view: boolean };
  readonly invalidated: readonly NleStudioInvalidation[];
  readonly result?: Readonly<Record<string, string | number | boolean>>;
};

export type NleStudioProjectionEvent = {
  readonly scope: "product" | "project";
  readonly kind: string;
  readonly status: NleEditingSurfaceStatus;
  readonly invalidated: readonly NleStudioInvalidation[];
  readonly generation?: number;
};

export type NleStudioCommandRequest = {
  readonly command: NleEditingSurfaceCommand;
};

export type NleStudioTimelineDrop = {
  readonly kind: "timeline.drop";
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
  readonly composition: string;
  readonly anchor: string;
  readonly items: readonly string[];
  readonly deltaFrames: number;
  readonly target:
    | { readonly kind: "track"; readonly track: string }
    | { readonly kind: "gap"; readonly before?: string };
};

type NleStudioCompositionOperation = {
  readonly expectedProjectRevision: number;
  readonly expectedViewRevision: number;
  readonly composition: string;
};

type NleStudioTimedPlacement = NleStudioCompositionOperation & {
  readonly track?: string;
  readonly atFrame: number;
  readonly durationFrames?: number;
};

type NleStudioOfferingReference = {
  readonly package: string;
  readonly offering: string;
};

export type NleStudioTimelineEdit = NleStudioCompositionOperation & (
  | { readonly kind: "timeline.trim"; readonly item: string; readonly edge: "start" | "end"; readonly atFrame: number }
  | { readonly kind: "timeline.split"; readonly items: readonly string[]; readonly atFrame: number }
  | { readonly kind: "timeline.remove"; readonly items: readonly string[] }
  | { readonly kind: "timeline.ripple-remove"; readonly items: readonly string[]; readonly tracks: readonly string[] }
  | { readonly kind: "timeline.close-gap"; readonly tracks: readonly string[]; readonly atFrame: number }
);

export type NleStudioOperation =
  | NleStudioTimelineDrop
  | NleStudioTimelineEdit
  | (NleStudioCompositionOperation & { readonly kind: "clipboard.copy" | "clipboard.cut"; readonly items: readonly string[] })
  | (NleStudioCompositionOperation & { readonly kind: "clipboard.paste"; readonly atFrame: number })
  | (NleStudioCompositionOperation & { readonly kind: "clipboard.apply-groups" })
  | (NleStudioTimedPlacement & {
      readonly kind: "media.materialize";
      readonly media: string;
      readonly includeAudio?: boolean;
      readonly layout?: NlePictureLayout;
    })
  | (NleStudioTimedPlacement & NleStudioOfferingReference & {
      readonly kind: "component.materialize";
      readonly media?: Readonly<Record<string, string>>;
    })
  | (NleStudioTimedPlacement & NleStudioOfferingReference & { readonly kind: "adjust.materialize" })
  | (NleStudioCompositionOperation & NleStudioOfferingReference & {
      readonly kind: "transition.materialize";
      readonly items: readonly [string, string];
      readonly durationFrames?: number;
    })
  | (Omit<NleStudioTimedPlacement, "durationFrames"> & {
      readonly kind: "composition.materialize";
      readonly source: string;
    })
  | (NleStudioCompositionOperation & { readonly kind: "composition.compound"; readonly items: readonly string[]; readonly name: string })
  | (NleStudioCompositionOperation & { readonly kind: "composition.make-unique" | "composition.explode"; readonly item: string })
  | (NleStudioCompositionOperation & { readonly kind: "composition.enter"; readonly item: string; readonly atFrame: number })
  | (NleStudioCompositionOperation & { readonly kind: "composition.select"; readonly target: string })
  | (NleStudioCompositionOperation & { readonly kind: "composition.return" })
  | (NleStudioCompositionOperation & { readonly kind: "audio.detach"; readonly item: string; readonly track?: string })
  | (NleStudioCompositionOperation & { readonly kind: "component-media.bind"; readonly item: string; readonly slot: string; readonly media: string })
  | (NleStudioCompositionOperation & { readonly kind: "component-media.unbind"; readonly item: string; readonly slot: string });

export type NleStudioActionRequest =
  | (NleStudioCompositionOperation & { readonly kind: "frame-preview"; readonly atFrame: number })
  | (NleStudioCompositionOperation & { readonly kind: "playback-preview"; readonly atFrame: number; readonly durationFrames: number })
  | {
      readonly kind: "delivery";
      readonly expectedProjectRevision: number;
      readonly destination: string;
      readonly profile: HtmlVideoDeliveryProfile;
      readonly renderer?: HtmlVideoRenderer;
    };

export type NleStudioActionKind = NleStudioActionRequest["kind"];
type NleStudioActionBase = { readonly handle: string; readonly kind: NleStudioActionKind; readonly progress: number };
export type NleStudioActionObservation = NleStudioActionBase & (
  | { readonly state: "queued" | "running" }
  | { readonly state: "complete"; readonly result: { readonly resource: string; readonly mediaType: string; readonly frameCount?: number } }
  | { readonly state: "failed"; readonly diagnostic: string }
  | { readonly state: "cancelled" }
);

export type NleStudioActionEvent = {
  readonly scope: "action";
  readonly kind: NleStudioActionKind;
  readonly action: Pick<NleStudioActionObservation, "handle" | "state" | "progress">;
};

export type NleStudioEvent = NleStudioProjectionEvent | NleStudioActionEvent;
export type NleStudioEventListener = (event: NleStudioEvent) => void;

export type NleStudioErrorResponse = {
  readonly error: string;
};
