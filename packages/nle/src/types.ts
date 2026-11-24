import type { PackageSymbol } from "./implementation.js";
import type { MediaInterpretation } from "@hypit/media";
import type { ExactTemporalValue, TemporalMapPiece, TemporalRate } from "@hypit/temporal/algebra";

export const nleProjectFormat = "hypit.nle-project";
export const defaultNleEditRate: TemporalRate = Object.freeze({ numerator: 30, denominator: 1 });

/** Unit-neutral finite Picture domain. Output pixels and background policy are not Project facts. */
export type NleCanvas = {
  readonly width: number;
  readonly height: number;
};

export type NleMediaReference = {
  /** Portable Media Asset document path relative to the NLE Project document. */
  readonly path: string;
};

/** One package-owned declaration that gives a shared value its exact Component meaning. */
export type NleComponentSharedValueDeclaration = {
  readonly kind: "component";
  readonly component: PackageSymbol;
  readonly slot: string;
};

/** One NLE-owned declaration for a shared Picture placement value. */
export type NlePictureLayoutSharedValueDeclaration = {
  readonly kind: "nle";
  readonly slot: "picture.layout";
};

/** One package Operator owns the meaning of this complete parameter value. */
export type NleOperatorSharedValueDeclaration = {
  readonly kind: "operator";
  readonly operator: PackageSymbol;
};

/** One Project-owned reusable value for one exact package Component slot. */
export type NleComponentSharedValue = {
  readonly id: string;
  readonly name: string;
  readonly declaration: NleComponentSharedValueDeclaration;
  /** Closed package-owned data. NLE preserves it but does not interpret its fields. */
  readonly value: Readonly<Record<string, unknown>>;
};

/** One owner-defined value, held inline by an occurrence or linked to a compatible Project value. */
export type NleValueBinding<T> =
  | {
      readonly kind: "inline";
      readonly value: T;
    }
  | {
      readonly kind: "shared";
      readonly ref: string;
    };

/** One package-owned Component slot value using the common inline/shared ownership model. */
export type NleComponentValueBinding = NleValueBinding<Readonly<Record<string, unknown>>> & {
  readonly slot: string;
};

/** Package selection for a non-default interpretation of one exact mapped signal read. */
export type NlePictureReconstruction = {
  readonly using: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
};

export type NlePictureLayout = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fit: "fill" | "contain" | "cover";
  /** Normalized alignment inside the Item frame. Both default to the centre. */
  readonly contentX?: number;
  readonly contentY?: number;
};

/** Insets in the interpreted source Picture, normalized independently on each axis. */
export type NlePictureCrop = {
  readonly left?: number;
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
};

export type NlePictureLayoutSharedValue = {
  readonly id: string;
  readonly name: string;
  readonly declaration: NlePictureLayoutSharedValueDeclaration;
  readonly value: NlePictureLayout;
};

/** One Project-owned reusable parameter value for one exact package Operator. */
export type NleOperatorSharedValue = {
  readonly id: string;
  readonly name: string;
  readonly declaration: NleOperatorSharedValueDeclaration;
  readonly value: Readonly<Record<string, unknown>>;
};

/** One typed Project value shared by explicit Component or NLE parameter slots. */
export type NleSharedValue = NleComponentSharedValue | NleOperatorSharedValue | NlePictureLayoutSharedValue;

/** Package-owned parameters use the common inline/shared ownership model. */
export type NleParameterBinding = NleValueBinding<Readonly<Record<string, unknown>>>;

export type NlePictureLayoutReference = {
  readonly ref: string;
};

export type NlePictureAppearance = {
  /** Occurrence-local selection of the source Picture before fitting. */
  readonly crop?: NlePictureCrop;
  /** Inline occurrence layout or one explicit Project-owned linked layout. */
  readonly layout: NlePictureLayout | NlePictureLayoutReference;
  /** Occurrence-local Picture processing, ordered inner-to-outer. */
  readonly processes?: readonly NleProcess[];
};

export type NleMediaPictureAppearance = NlePictureAppearance & {
  readonly reconstruction?: NlePictureReconstruction;
};

export type NleAudioAppearance = {
  /** Occurrence-local Audio processing, ordered inner-to-outer. */
  readonly processes?: readonly NleProcess[];
};

/** Item-local target-to-Source coordinates. A concrete Source domain attaches during lowering. */
export type NleTimeMapping = {
  readonly pieces: readonly TemporalMapPiece[];
};

export type NleProcessControlTime =
  | (NleTimeMapping & { readonly controlDuration?: ExactTemporalValue })
  | {
      readonly edge: "start" | "end";
      readonly duration: ExactTemporalValue;
      readonly controlDuration: ExactTemporalValue;
    };

export type NleProcess = {
  readonly id: string;
  readonly operator: PackageSymbol;
  readonly enabled: boolean;
  readonly parameters: NleParameterBinding;
  /** Item-local target coordinates selecting the package Operator's Control clock. */
  readonly controlTime: NleProcessControlTime;
};

type NleTimelineItemBase = {
  readonly id: string;
  readonly name?: string;
  readonly start: ExactTemporalValue;
  readonly duration: ExactTemporalValue;
  readonly enabled: boolean;
};

type NlePresentBase = NleTimelineItemBase & {
  readonly kind: "present";
  readonly sourceTime: NleTimeMapping;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

export type NleMediaItem = NlePresentBase & {
  readonly source: "media";
  readonly picture?: NleMediaPictureAppearance;
  readonly asset: NleMediaReference;
};

export type NleComponentItem = NlePresentBase & {
  readonly source: "component";
  readonly audio?: never;
  readonly component: PackageSymbol;
  /** Package-defined values remain distinct from occurrence-local parameters and may be inline or shared. */
  readonly valueBindings?: readonly NleComponentValueBinding[];
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Package-defined input names mapped to portable project Media Asset references. */
  readonly media?: Readonly<Record<string, NleMediaReference>>;
};

/** One occurrence of another Composition definition owned by the same NLE Project. */
export type NleCompositionItem = NlePresentBase & {
  readonly source: "composition";
  readonly composition: string;
};

export type NlePresentItem = NleMediaItem | NleComponentItem | NleCompositionItem;

/** Programme-scoped processing over the Picture or Audio accumulated below this Track position. */
export type NleAdjustItem = NleTimelineItemBase & Omit<NleProcess, "controlTime"> & {
  readonly controlTime: NleTimeMapping;
  readonly kind: "adjust";
};

export type NleItem = NlePresentItem | NleAdjustItem;

export type NleTrackRole = "picture" | "audio" | "text" | "subtitle" | "filter" | "effect";

export type NleTrack = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio";
  readonly role: NleTrackRole;
  readonly pictureEnabled: boolean;
  readonly audioEnabled: boolean;
  /** Picture Tracks and their Items are ordered back-to-front. */
  readonly items: readonly NleItem[];
};

/** Direct overlap relation. Active range is [incoming.start, outgoing.end). */
export type NleTransition = {
  readonly id: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly operator: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
};

/** Direct Picture dependency. The matte Item is sampled but not independently painted. */
export type NleMatte = {
  readonly id: string;
  readonly content: string;
  readonly matte: string;
};

/** Composition-local membership for linked Item movement. */
export type NleEditGroup = {
  readonly id: string;
  readonly items: readonly string[];
};

export type NleComposition = {
  readonly id: string;
  readonly name: string;
  readonly canvas: NleCanvas;
  readonly tracks: readonly NleTrack[];
  readonly transitions: readonly NleTransition[];
  readonly mattes: readonly NleMatte[];
  readonly groups: readonly NleEditGroup[];
};

export type NleProject = {
  readonly format: typeof nleProjectFormat;
  readonly id: string;
  readonly name: string;
  /** Default preview, lowering and delivery entry. */
  readonly rootComposition: string;
  /** Frame grid for addressing edits and sampling the editor preview. Item times remain exact. */
  readonly editRate: TemporalRate;
  /** Typed Project-wide values addressable from explicit slots in any Composition. */
  readonly sharedValues: readonly NleSharedValue[];
  readonly compositions: readonly NleComposition[];
};

/** File-persistent Media facts accepted by the pure materialization planner. */
export type NleMediaInterpretation = MediaInterpretation;
