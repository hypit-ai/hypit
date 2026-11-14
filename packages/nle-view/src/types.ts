import type {
  NleCanvas,
  NlePictureExtent,
  NlePictureLayout,
  NlePictureRect,
} from "@hypit/nle";
import type { TemporalRate } from "@hypit/temporal/algebra";

export type NleTimelineProjectReference = {
  /** Portable path relative to the Timeline View file. */
  readonly path: string;
};

export type NleTimelineTrackState = {
  readonly track: string;
  /** Editor guard only; it never changes Programme output. */
  readonly locked: boolean;
  /** Optional authored workspace height; absence selects the Workbench default for the Track kind. */
  readonly heightPx?: number;
};

/** Durable linked-editing relation. It has no AVIR meaning. */
export type NleTimelineGroup = {
  readonly id: string;
  readonly name: string;
  readonly items: readonly string[];
};

/** Persistent editing projection of one NLE Project. */
export type NleTimelineView = {
  readonly format: "hypit.nle-view@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly project: NleTimelineProjectReference;
  /** Display and snap grid only; Programme time remains exact. */
  readonly editRate: TemporalRate;
  readonly tracks: readonly NleTimelineTrackState[];
  readonly groups: readonly NleTimelineGroup[];
};

/** Studio-owned finite palette. Packages and Item kinds never become CSS selectors. */
export type NleTimelineTone =
  | "blue"
  | "blue-muted"
  | "green"
  | "green-muted"
  | "teal"
  | "violet"
  | "magenta"
  | "magenta-muted"
  | "orange"
  | "orange-muted"
  | "neutral";

export type NleTimelinePreviewObservation = {
  readonly kind: "image" | "video" | "audio";
} & (
  | { readonly state: "pending" | "unavailable"; readonly resource?: never }
  | { readonly state: "ready"; readonly resource: string }
);

/** Finite timeline body vocabulary rendered by Workbench. */
export type NleTimelineDisplayLayer =
  | {
      readonly kind: "text";
      readonly role: "content";
      readonly text: string;
    }
  | {
      readonly kind: "preview";
      readonly role: "content" | "decoration";
      readonly preview: NleTimelinePreviewObservation;
      readonly layout: "filmstrip" | "repeat-x" | "cover" | "contain" | "waveform";
      readonly direction?: "forward" | "reverse";
    };

/** Semantic capability after package/Core support and current View guards are applied. */
export type NleTimelineItemCapabilities = {
  readonly item: string;
  readonly move: boolean;
  readonly trimStart: boolean;
  readonly trimEnd: boolean;
  readonly split: boolean;
};

/** Product-visible subset of semantic capabilities. */
export type NleTimelineAffordancePolicy = Omit<NleTimelineItemCapabilities, "item">;
export type NleTimelineItemAffordances = NleTimelineAffordancePolicy & {
  readonly select: true;
};

/**
 * Invocation-local description or preview for one exact Item. It may come from
 * a package presentation facet or a Workbench cache and is never serialized.
 */
export type NleTimelineItemObservation = {
  readonly item: string;
  readonly title?: string;
  readonly layers?: readonly NleTimelineDisplayLayer[];
  /** Host-observed Source geometry used only by the spatial editing projection. */
  readonly picture?: {
    readonly sourceExtent: NlePictureExtent;
  };
  readonly presentation?: {
    readonly tone: NleTimelineTone;
    readonly chrome: "standard" | "group" | "compact";
    /** Package-preferred default for a Track containing this Item. Persisted View height wins. */
    readonly heightPx?: number;
  };
};

export type NleTimelineSceneItem = {
  readonly id: string;
  readonly track: string;
  readonly role: "present" | "adjustment";
  readonly source: "media" | "component" | "composition" | "adjustment";
  readonly enabled: boolean;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly display: {
    readonly title: string;
    readonly layers: readonly NleTimelineDisplayLayer[];
  };
  readonly presentation: {
    readonly tone: NleTimelineTone;
    readonly chrome: "standard" | "group" | "compact";
    readonly heightPx?: number;
  };
  readonly affordances: NleTimelineItemAffordances;
};

export type NleTimelineSceneTrack = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio";
  readonly muted: boolean;
  readonly locked: boolean;
  /** Default rendered height. A future persisted resize remains a View fact. */
  readonly heightPx: number;
  readonly tone: NleTimelineTone;
  readonly items: readonly NleTimelineSceneItem[];
};

/** Read-only rendering projection. It is not another persistent Timeline View. */
export type NleTimelineScene = {
  readonly tracks: readonly NleTimelineSceneTrack[];
  readonly maximumFrame: number;
};

export type NleCanvasSceneLayerOwner =
  | { readonly kind: "item" }
  | {
      readonly kind: "picture-layout";
      readonly ref: string;
      readonly name: string;
      readonly sharedBy: readonly string[];
    };

/** One NLE Item-level contribution in back-to-front Programme paint order. */
export type NleCanvasSceneLayer = {
  readonly id: string;
  readonly track: string;
  readonly title: string;
  readonly role: "present" | "adjustment";
  readonly source: "media" | "component" | "composition" | "adjustment";
  readonly enabled: boolean;
  readonly trackMuted: boolean;
  readonly startFrame: number;
  readonly durationFrames: number;
  /** Adjustment layers transform accumulated Picture and therefore own no rectangle. */
  readonly layout?: NlePictureLayout;
  /** Source content after fit, in Programme coordinates; it may extend beyond the Item frame for cover. */
  readonly content?: NlePictureRect;
  readonly owner: NleCanvasSceneLayerOwner;
  readonly affordances: {
    readonly select: true;
    readonly translate: boolean;
    readonly resize: false | {
      readonly handles: readonly ["nw", "ne", "se", "sw"];
      readonly minimumWidth: number;
      readonly minimumHeight: number;
      /** Corner drags preserve the authored frame ratio unless the user explicitly requests free resize. */
      readonly aspectRatio: number;
    };
  };
};

/** Read-only spatial editing projection; it is neither Programme output nor persistent View state. */
export type NleCanvasScene = {
  readonly canvas: NleCanvas;
  readonly layers: readonly NleCanvasSceneLayer[];
};
