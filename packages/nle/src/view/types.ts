import type { TemporalRate } from "@hypit/temporal/algebra";
import type { NlePictureExtent, NlePictureRect } from "../picture.js";
import type { NleSpatialEdit } from "../spatial-authoring.js";
import type { NleCanvas, NlePictureLayout, NleSharedValue } from "../types.js";

export const nleViewFormat = "hypit.nle-view";

export type NleViewProjectReference = {
  /** Portable path relative to the NLE View document. */
  readonly path: string;
};

export type NleViewTrackState = {
  readonly track: string;
  /** Editing guard only. It never changes Programme evaluation. */
  readonly locked: boolean;
  /** Optional durable row height. Absence lets a projection choose its default. */
  readonly heightPx?: number;
};

/** Durable linked-editing relation with no audiovisual meaning. */
export type NleEditGroup = {
  readonly id: string;
  readonly name: string;
  readonly items: readonly string[];
};

/** Durable editor choices scoped to one Project-owned Composition. */
export type NleViewCompositionState = {
  readonly composition: string;
  readonly tracks: readonly NleViewTrackState[];
  readonly groups: readonly NleEditGroup[];
};

/** Persistent editing arrangement for one NLE Project document. */
export type NleView = {
  readonly format: typeof nleViewFormat;
  readonly id: string;
  readonly name: string;
  readonly project: NleViewProjectReference;
  /** Composition initially opened by an editor using this View. */
  readonly activeComposition: string;
  /** Display and editing grid only. Programme time remains exact. */
  readonly editRate: TemporalRate;
  /** Sparse durable state for Composition timelines used by this View. */
  readonly compositions: readonly NleViewCompositionState[];
};

/** Product-owned finite visual vocabulary; package names never become CSS selectors. */
export type NleTimelineTone =
  | "blue"
  | "blue-muted"
  | "green"
  | "green-muted"
  | "violet"
  | "magenta"
  | "orange"
  | "neutral";

export type NleTimelineDisplayLayer =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "preview";
      readonly media: "image" | "video" | "audio";
      readonly state: "pending" | "unavailable";
      readonly layout: "filmstrip" | "repeat-x" | "cover" | "contain" | "waveform";
    }
  | {
      readonly kind: "preview";
      readonly media: "image" | "video" | "audio";
      readonly state: "ready";
      /** Invocation-local Host resource address; never persisted in the View. */
      readonly resource: string;
      readonly layout: "filmstrip" | "repeat-x" | "cover" | "contain" | "waveform";
    };

/** Invocation-local package or Host description for one exact Item. */
export type NleTimelineItemObservation = {
  readonly item: string;
  readonly title?: string;
  readonly layers?: readonly NleTimelineDisplayLayer[];
  /** Host-observed Source geometry used only by the Canvas projection. */
  readonly picture?: { readonly sourceExtent: NlePictureExtent };
  readonly presentation?: {
    readonly tone: NleTimelineTone;
    readonly chrome: "standard" | "group" | "compact";
    readonly heightPx?: number;
  };
};

/** Semantic edit support after package declarations and current View guards are applied. */
export type NleTimelineItemCapabilities = {
  readonly item: string;
  readonly move: boolean;
  readonly trimStart: boolean;
  readonly trimEnd: boolean;
  readonly split: boolean;
};

/** Product-visible subset of the semantic capability set. */
export type NleTimelineAffordancePolicy = Omit<NleTimelineItemCapabilities, "item">;

export type NleTimelineItemAffordances = NleTimelineAffordancePolicy & {
  readonly select: true;
};

export type NleTimelineSceneItem = {
  readonly id: string;
  readonly track: string;
  readonly role: "present" | "adjust";
  readonly source: "media" | "component" | "composition" | "adjust";
  readonly signals: { readonly picture: boolean; readonly audio: boolean };
  readonly nestedComposition?: string;
  readonly enabled: boolean;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly group?: string;
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
  readonly enabled: boolean;
  readonly locked: boolean;
  readonly heightPx: number;
  readonly tone: NleTimelineTone;
  readonly items: readonly NleTimelineSceneItem[];
};

/** Rebuildable finite read model for the active Composition Timeline. */
export type NleTimelineScene = {
  readonly composition: string;
  readonly editRate: TemporalRate;
  readonly groups: readonly NleEditGroup[];
  readonly transitions: readonly {
    readonly id: string;
    readonly outgoing: string;
    readonly incoming: string;
    readonly operator: import("@hypit/audiovisual").PackageSymbol;
  }[];
  readonly mattes: readonly { readonly id: string; readonly content: string; readonly matte: string }[];
  readonly tracks: readonly NleTimelineSceneTrack[];
  readonly maximumFrame: number;
};

export type NleSpatialItemCapabilities = {
  readonly item: string;
  readonly replaceLayout: boolean;
  readonly translateFrame: boolean;
  readonly resizeFrame: boolean;
  readonly setFit: boolean;
  readonly setFocus: boolean;
  readonly shareLayout: boolean;
  readonly linkLayout: boolean;
  readonly unlinkLayout: boolean;
};

export type NleCanvasAffordancePolicy = {
  readonly translateFrame: boolean;
  readonly resizeFrame: boolean;
};

export type NleCanvasSceneLayer = {
  readonly id: string;
  readonly track: string;
  readonly title: string;
  readonly role: "present" | "adjust";
  readonly source: "media" | "component" | "composition" | "adjust";
  readonly enabled: boolean;
  readonly trackEnabled: boolean;
  readonly layout?: NlePictureLayout;
  readonly content?: NlePictureRect;
  readonly affordances: {
    readonly select: true;
    readonly translate: boolean;
    readonly resize: false | {
      readonly handles: readonly ["nw", "ne", "se", "sw"];
      readonly minimumWidth: number;
      readonly minimumHeight: number;
      readonly aspectRatio: number;
    };
  };
};

export type NleCanvasScene = {
  readonly composition: string;
  readonly canvas: NleCanvas;
  readonly layers: readonly NleCanvasSceneLayer[];
};

/** Type-only assertion that the View guard vocabulary stays aligned with Project spatial plans. */
export type NleSpatialEditKind = NleSpatialEdit["kind"];

export type NleInspectorDomain = "where" | "when" | "how";
export type NleInspectorControl = "readout" | "text" | "number" | "boolean" | "select" | "color";

export type NleInspectorField = {
  readonly id: string;
  readonly label: string;
  readonly control: NleInspectorControl;
  readonly value: string | number | boolean;
  readonly unit?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly editable?: true;
};

export type NleInspectorFieldDraft = Omit<NleInspectorField, "editable"> & {
  /** Process-local semantic operation projector. It is stripped from the Scene. */
  readonly operation?: (value: string | number | boolean) => unknown;
};

export type NleInspectorCollectionRow = {
  /** Stable package-owned row identity, not an array index or document path. */
  readonly id: string;
  readonly label?: string;
  readonly fields: readonly NleInspectorField[];
};

export type NleInspectorCollection = {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly NleInspectorCollectionRow[];
};

export type NleInspectorCollectionRowDraft = Omit<NleInspectorCollectionRow, "fields"> & {
  readonly fields: readonly NleInspectorFieldDraft[];
};

export type NleInspectorCollectionDraft = Omit<NleInspectorCollection, "rows"> & {
  readonly rows: readonly NleInspectorCollectionRowDraft[];
};

export type NleInspectorSection = {
  readonly id: string;
  readonly label: string;
  readonly domain: NleInspectorDomain;
  readonly owner:
    | { readonly kind: "nle" }
    | { readonly kind: "package"; readonly symbol: import("@hypit/audiovisual").PackageSymbol }
    | {
        readonly kind: "shared-value";
        readonly ref: string;
        readonly name: string;
        readonly declaration: NleSharedValue["declaration"];
        readonly sharedBy: readonly string[];
      }
    | { readonly kind: "host" };
  readonly fields: readonly NleInspectorField[];
  readonly collections?: readonly NleInspectorCollection[];
};

export type NleInspectorSectionDraft = Omit<NleInspectorSection, "owner" | "fields" | "collections"> & {
  readonly fields: readonly NleInspectorFieldDraft[];
  readonly collections?: readonly NleInspectorCollectionDraft[];
};

export type NleInspectorScene = {
  readonly item: string;
  readonly title: string;
  readonly sections: readonly NleInspectorSection[];
  readonly processes: readonly NleInspectorProcess[];
};

export type NleInspectorProcess = {
  readonly medium: "picture" | "audio";
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly editable: boolean;
};
