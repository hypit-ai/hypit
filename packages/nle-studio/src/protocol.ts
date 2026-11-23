import type {
  NleEditingSurfaceCommand,
  NleEditingSurfaceStatus,
} from "@hypit/nle/surface";
import type {
  NleCanvasScene,
  NleComponentDefinition,
  NleComponentMediaInput,
  NleInspectorScene,
  NleTimelineScene,
  NleTransitionInspectorScene,
} from "@hypit/nle/surface";
import type { HtmlVideoDeliveryProfile, HtmlVideoRenderer } from "@hypit/html-video";
import type { PicturePreviewRate } from "@hypit/media";
import type { NleComposition, NlePictureLayout } from "@hypit/nle";
import type { ProjectMediaLibrarySnapshot, ProjectMediaViewRequest, ProjectMediaViewResult } from "@hypit/media-asset/service";
import type { ExactTemporalValue, TemporalMap, TemporalRange, TemporalRate } from "@hypit/temporal/algebra";

export type NleStudioMediaEntry = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio" | "audiovisual" | "unknown";
  readonly state: "available" | "missing" | "invalid";
  readonly mediaType?: string;
  readonly fileExtension?: string;
  /** Present when the Media Asset manifest was read successfully. */
  readonly adoptedAt?: string;
  readonly pictureKind?: "constant" | "signal";
  readonly pictureVersion?: string;
  readonly audioVersion?: string;
  readonly duration?: ExactTemporalValue;
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
  readonly generation: number;
  readonly derivedViews: boolean;
  readonly removeAssets: boolean;
  readonly entries: readonly NleStudioMediaEntry[];
};

export type NleStudioMediaLibraryProjection =
  | ({ readonly state: "available" } & ProjectMediaLibrarySnapshot)
  | { readonly state: "invalid"; readonly diagnostic: string };

export type NleStudioComponentCatalogEntry = {
  readonly package: string;
  readonly offering: string;
  readonly title: string;
  readonly role: NleComponentDefinition["role"];
  readonly durationFrames: number;
};

export type NleStudioProcessCatalogEntry = {
  readonly package: string;
  readonly offering: string;
  readonly title: string;
  readonly medium: "picture" | "audio";
};

export type NleStudioAdjustCatalogEntry = NleStudioProcessCatalogEntry & {
  readonly role: "filter" | "effect";
  readonly durationFrames: number;
};

export type NleStudioTransitionCatalogEntry = {
  readonly package: string;
  readonly offering: string;
  readonly title: string;
};

export type NleStudioCatalogProjection = {
  readonly components: readonly NleStudioComponentCatalogEntry[];
  readonly adjusts: readonly NleStudioAdjustCatalogEntry[];
  readonly processes: readonly NleStudioProcessCatalogEntry[];
  readonly transitions: readonly NleStudioTransitionCatalogEntry[];
};

export type NleStudioPreviewProjection =
  | { readonly state: "unavailable" }
  | { readonly state: "available"; readonly playback: boolean; readonly waveform: boolean; readonly generation: number;
      readonly programme?: NleStudioProgrammeProjection };

export type NleStudioProgrammeProjection = {
  readonly generation: string;
  readonly composition: string;
  readonly document: string;
};

export type NleStudioDeliveryProjection =
  | { readonly state: "available"; readonly width: number; readonly height: number; readonly hasItems: boolean }
  | { readonly state: "unavailable" };

export type NleStudioClipboardProjection = {
  readonly items: number;
  readonly groups: number;
};

export type NleStudioDropDestination =
  | { readonly track: string }
  | { readonly gap: true; readonly before?: string };

export type NleStudioTrimRange = { readonly minimum: number; readonly maximum: number };

export type NleStudioTimelineProjection = {
  readonly scene: NleTimelineScene;
  readonly canReturn: boolean;
  readonly compositions: readonly (Pick<NleComposition, "id" | "name" | "canvas"> & {
    readonly referenced: boolean;
    readonly canInsert: boolean;
  })[];
  readonly retimeRates: Readonly<Record<string, TemporalRate>>;
  /** Active-Composition Media Items resolved to Project Media Catalog identities by the Product backend. */
  readonly itemMedia: readonly { readonly item: string; readonly media: string }[];
  readonly previewSources: Readonly<Record<string, NleStudioTimelinePreview>>;
  readonly trimRanges: Readonly<Record<string, Partial<Record<"start" | "end", NleStudioTrimRange>>>>;
};

type TimelineSourceClock = { readonly sourceTime: TemporalMap; readonly duration: ExactTemporalValue };

type TimelineMediaPictureSource = {
  readonly media: string;
  readonly version?: string;
  readonly displayAspectRatio: number;
} & Partial<TimelineSourceClock>;

export type NleStudioRenderedAudioSource = {
  readonly target: { readonly kind: "composition"; readonly composition: string };
  readonly version: string;
};

export type NleStudioTimelineAudioPreviewSource = TimelineSourceClock & (
  | { readonly media: string; readonly version?: string }
  | NleStudioRenderedAudioSource
);

export type NleStudioRenderedPictureTarget =
  | { readonly kind: "composition"; readonly composition: string }
  | { readonly kind: "component"; readonly composition: string; readonly item: string };

type TimelineRenderedPictureSource = {
  readonly version: string;
  readonly displayAspectRatio?: number;
} & (
  | (TimelineSourceClock & { readonly target: Extract<NleStudioRenderedPictureTarget, { kind: "composition" }> })
  | { readonly target: Extract<NleStudioRenderedPictureTarget, { kind: "component" }>; readonly range: TemporalRange;
      readonly duration?: never; readonly sourceTime?: never }
);

export type NleStudioTimelinePicturePreviewSource = TimelineMediaPictureSource | TimelineRenderedPictureSource;

export type NleStudioTimelinePreview = {
  readonly picture?: NleStudioTimelinePicturePreviewSource;
  readonly audio?: NleStudioTimelineAudioPreviewSource;
};

export type NleStudioStatus = NleEditingSurfaceStatus & {
  /** Last write time of the accepted SVML document. */
  readonly savedAt: string;
};

/** Complete finite projection used to open one NLE Studio Product Session. */
export type NleStudioOpenProjection = {
  readonly project: {
    readonly name: string;
    readonly document: string;
    readonly rootComposition: string;
    /** Project Media identities referenced anywhere in this NLE document. */
    readonly usedMedia: readonly string[];
  };
  readonly status: NleStudioStatus;
  readonly timeline: NleStudioTimelineProjection;
  readonly canvas: NleCanvasScene;
  readonly media: NleStudioMediaProjection;
  readonly mediaLibrary: NleStudioMediaLibraryProjection;
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
  | { readonly kind: "timeline-drop"; readonly drop: NleStudioTimelineDrop }
  | { readonly kind: "canvas" }
  | { readonly kind: "inspector"; readonly item: string }
  | { readonly kind: "transition-inspector"; readonly transition: string }
  | { readonly kind: "component-inputs"; readonly item: string }
  | { readonly kind: "media" }
  | { readonly kind: "media-library" }
  | { readonly kind: "catalog" }
  | { readonly kind: "preview" }
  | { readonly kind: "delivery" }
  | { readonly kind: "action"; readonly handle: string }
  | { readonly kind: "clipboard" };

export type NleStudioObservation =
  | { readonly kind: "open"; readonly value: NleStudioOpenProjection }
  | { readonly kind: "project"; readonly value: NleStudioOpenProjection["project"] }
  | { readonly kind: "status"; readonly value: NleStudioStatus }
  | { readonly kind: "timeline"; readonly value: NleStudioTimelineProjection }
  | { readonly kind: "timeline-drop"; readonly value: NleStudioDropDestination }
  | { readonly kind: "canvas"; readonly value: NleCanvasScene }
  | { readonly kind: "inspector"; readonly value: NleInspectorScene }
  | { readonly kind: "transition-inspector"; readonly value: NleTransitionInspectorScene }
  | { readonly kind: "component-inputs"; readonly value: NleStudioComponentInputsProjection }
  | { readonly kind: "media"; readonly value: NleStudioMediaProjection }
  | { readonly kind: "media-library"; readonly value: NleStudioMediaLibraryProjection }
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
  | "media-library"
  | "catalog"
  | "preview"
  | "delivery"
  | "clipboard";

export type NleStudioOperationReceipt = {
  readonly operation: string;
  readonly status: NleStudioStatus;
  readonly projectChanged: boolean;
  readonly invalidated: readonly NleStudioInvalidation[];
  readonly result?: Readonly<Record<string, string | number | boolean>>;
};

export type NleStudioProjectionEvent = {
  readonly scope: "product" | "project";
  readonly kind: string;
  readonly status: NleStudioStatus;
  readonly invalidated: readonly NleStudioInvalidation[];
  readonly generation?: number;
};

export type NleStudioCommandRequest = {
  readonly command: NleEditingSurfaceCommand;
};

export type NleStudioTimelineDrop = {
  readonly kind: "timeline.drop";
  readonly expectedProjectRevision: number;
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
  readonly composition: string;
};

type NleStudioTimedPlacement = NleStudioCompositionOperation & {
  readonly track?: string;
  readonly atFrame: number;
  readonly durationFrames?: number;
};

type NleStudioPresentPlacement = NleStudioTimedPlacement & (
  | { readonly insertTracks?: never }
  | { readonly track: string; readonly insertTracks: readonly string[] }
);

type NleStudioOfferingReference = {
  readonly package: string;
  readonly offering: string;
};

export type NleStudioTimelineEdit = NleStudioCompositionOperation & (
  | { readonly kind: "timeline.trim"; readonly item: string; readonly edge: "start" | "end"; readonly atFrame: number }
  | { readonly kind: "timeline.slip"; readonly item: string; readonly deltaFrames: number }
  | { readonly kind: "timeline.retime"; readonly item: string; readonly rate: TemporalRate }
  | { readonly kind: "timeline.roll"; readonly left: string; readonly right: string; readonly atFrame: number }
  | { readonly kind: "timeline.ripple-trim"; readonly item: string; readonly tracks: readonly string[]; readonly atFrame: number }
  | { readonly kind: "timeline.split"; readonly items: readonly string[]; readonly atFrame: number }
  | { readonly kind: "timeline.remove"; readonly items: readonly string[] }
  | { readonly kind: "timeline.ripple-remove"; readonly items: readonly string[]; readonly tracks: readonly string[] }
  | { readonly kind: "timeline.close-gap"; readonly tracks: readonly string[]; readonly atFrame: number }
);

export type NleStudioOperation =
  | NleStudioTimelineDrop
  | NleStudioTimelineEdit
  | (NleStudioCompositionOperation & { readonly kind: "track-lock.set"; readonly track: string; readonly locked: boolean })
  | (NleStudioCompositionOperation & { readonly kind: "timeline.track-reorder"; readonly track: string; readonly before?: string })
  | (NleStudioCompositionOperation & { readonly kind: "clipboard.copy" | "clipboard.cut"; readonly items: readonly string[] })
  | (NleStudioCompositionOperation & { readonly kind: "clipboard.paste"; readonly atFrame: number })
  | (NleStudioPresentPlacement & {
      readonly kind: "media.materialize";
      readonly media: string;
      readonly includeAudio?: boolean;
      readonly layout?: NlePictureLayout;
    })
  | (NleStudioPresentPlacement & {
      readonly kind: "media.freeze";
      readonly item: string;
      readonly sampleFrame: number;
      readonly durationFrames: number;
    })
  | (NleStudioPresentPlacement & NleStudioOfferingReference & {
      readonly kind: "component.materialize";
      readonly media?: Readonly<Record<string, string>>;
      readonly values?: Readonly<Record<string,
        { readonly kind: "link"; readonly ref: string } | { readonly kind: "share"; readonly name: string }>>;
    })
  | (NleStudioTimedPlacement & NleStudioOfferingReference & { readonly kind: "adjust.materialize" })
  | (NleStudioCompositionOperation & NleStudioOfferingReference & {
      readonly kind: "process.materialize"; readonly item: string; readonly before?: string;
    })
  | (NleStudioCompositionOperation & NleStudioProcessEdit)
  | (NleStudioCompositionOperation & NleStudioOfferingReference & {
      readonly kind: "transition.materialize";
      readonly durationFrames?: number;
    } & (
      | { readonly items: readonly [string, string] }
      | { readonly track: string; readonly atFrame: number }
    ))
  | (NleStudioCompositionOperation & NleStudioOfferingReference & {
      readonly kind: "transition.replace"; readonly transition: string; readonly durationFrames?: number;
    })
  | (NleStudioCompositionOperation & {
      readonly kind: "transition.resize"; readonly transition: string; readonly durationFrames: number;
    })
  | (NleStudioCompositionOperation & { readonly kind: "transition.remove"; readonly transition: string })
  | (NleStudioPresentPlacement & {
      readonly kind: "composition.materialize";
      readonly source: string;
      readonly durationFrames?: never;
    })
  | (NleStudioCompositionOperation & { readonly kind: "composition.compound"; readonly items: readonly string[]; readonly name: string })
  | (NleStudioCompositionOperation & { readonly kind: "composition.duplicate"; readonly source: string })
  | (NleStudioCompositionOperation & { readonly kind: "composition.make-unique" | "composition.explode"; readonly item: string })
  | (NleStudioCompositionOperation & { readonly kind: "composition.enter"; readonly item: string; readonly atFrame: number })
  | (NleStudioCompositionOperation & { readonly kind: "composition.select"; readonly target: string })
  | (NleStudioCompositionOperation & { readonly kind: "composition.return" })
  | (NleStudioCompositionOperation & { readonly kind: "audio.detach"; readonly item: string; readonly track?: string })
  | (NleStudioCompositionOperation & { readonly kind: "component-media.bind"; readonly item: string; readonly slot: string; readonly media: string })
  | (NleStudioCompositionOperation & { readonly kind: "component-media.unbind"; readonly item: string; readonly slot: string });

export type NleStudioProcessAddress = {
  readonly item: string;
  readonly medium: "picture" | "audio";
  readonly process: string;
};

export type NleStudioProcessEdit = NleStudioProcessAddress & (
  | { readonly kind: "process.enable"; readonly enabled: boolean }
  | { readonly kind: "process.move"; readonly before?: string }
  | { readonly kind: "process.remove" }
  | { readonly kind: "process.timing"; readonly edge: "start" | "end"; readonly durationFrames?: number }
  | { readonly kind: "process.timing"; readonly edge: "mapping" }
);

export type NleStudioMediaActionRequest = ProjectMediaViewRequest;

export type NleStudioRenderedPicturePreviewRequest = {
  readonly kind: "picture.source-preview";
  readonly target: NleStudioRenderedPictureTarget;
  readonly version: string;
  readonly positions: readonly ExactTemporalValue[];
  readonly samplesPerSecond?: PicturePreviewRate;
};

export type NleStudioRenderedAudioPreviewRequest = NleStudioRenderedAudioSource & {
  readonly kind: "audio.source-preview";
  readonly samplesPerPeak: number;
  readonly blocks: readonly number[];
};

export type NleStudioActionRequest =
  | NleStudioMediaActionRequest
  | NleStudioRenderedPicturePreviewRequest
  | NleStudioRenderedAudioPreviewRequest
  | (NleStudioCompositionOperation & { readonly kind: "frame-preview"; readonly atFrame: number })
  | (NleStudioCompositionOperation & { readonly kind: "playback-preview"; readonly atFrame: number; readonly durationFrames: number })
  | (NleStudioCompositionOperation & {
      readonly kind: "programme-waveform"; readonly atFrame: number; readonly durationFrames: number;
      readonly width?: number; readonly height?: number;
    })
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
  | { readonly state: "complete"; readonly result: ProjectMediaViewResult & { readonly frameCount?: number } }
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
  readonly code?: "document-conflict";
};
