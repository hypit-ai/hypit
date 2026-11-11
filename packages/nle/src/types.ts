import type {
  AudioOperator,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "@hypit/audiovisual";
import type { PreparedMedia } from "@hypit/media";
import type { CanonicalValue, ModuleRef } from "@hypit/protocol";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMapPiece,
} from "@hypit/temporal/algebra";

/** Finite logical Programme Picture extent; width and height do not prescribe output pixel density. */
export type NleCanvas = {
  readonly width: number;
  readonly height: number;
  readonly clearColor: string;
};

export type NlePackageSymbol = {
  readonly module: ModuleRef;
  readonly name: string;
};

/** One project-owned value for one exact package-defined Component slot. */
export type NleComponentValue = {
  readonly id: string;
  readonly name: string;
  readonly component: NlePackageSymbol;
  readonly slot: string;
  readonly value: CanonicalValue;
};

/** An Item binds a package-defined slot to one explicit project value. */
export type NleComponentBinding = {
  readonly slot: string;
  readonly ref: string;
};

export type NleMediaAssetReference = {
  readonly path: string;
};

/** Ephemeral media value supplied by the Host; it is never serialized in an NLE Project. */
export type NleResolvedMedia = PreparedMedia;

/** File-persistent media facts sufficient to create a direct NLE edit. */
export type NleMediaInterpretation = Omit<PreparedMedia, "source">;

export type NlePictureLayout = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fit: "fill" | "contain" | "cover";
  /** Normalized source point aligned within the fitted box. Defaults to the centre. */
  readonly contentX?: number;
  /** Normalized source point aligned within the fitted box. Defaults to the centre. */
  readonly contentY?: number;
};

export type NlePictureLayoutValue = {
  readonly id: string;
  readonly name: string;
  readonly layout: NlePictureLayout;
};

export type NlePictureLayoutReference = {
  readonly ref: string;
};

/** One package-owned Picture operator applied only to its Present Item, ordered inner-to-outer. */
export type NlePictureEffect = {
  readonly id: string;
  readonly component: NlePackageSymbol;
  readonly parameters: CanonicalValue;
};

export type NlePictureAppearance = {
  /** Inline occurrence layout or one explicit project-owned linked layout. */
  readonly layout: NlePictureLayout | NlePictureLayoutReference;
  /** Local treatment of this Item after fitting and before Programme-space placement. */
  readonly effects?: readonly NlePictureEffect[];
};

export type NleResolvedPictureAppearance = Omit<NlePictureAppearance, "layout"> & {
  readonly layout: NlePictureLayout;
};

export type NleAudioAppearance = {
  /** Package-owned reconstruction of this Item's mapped Audio read. */
  readonly reconstruction?: {
    readonly using: NlePackageSymbol;
    readonly parameters: CanonicalValue;
  };
};

/** Direct Item-local target-to-Source coordinates. Concrete Source domains are attached only during lowering. */
export type NleSourceTime = {
  readonly pieces: readonly TemporalMapPiece[];
};

type NleItemBase = {
  readonly id: string;
  /** Optional author-facing occurrence name; it never changes Programme output. */
  readonly name?: string;
  /** Exact Programme-local position. */
  readonly start: ExactTemporalValue;
  /** Exact visible duration. */
  readonly duration: ExactTemporalValue;
  /** Exact source-time facts over the Item-local interval [0, duration]. */
  readonly sourceTime: NleSourceTime;
  readonly enabled: boolean;
};

export type NleMediaItem = NleItemBase & {
  readonly kind: "present";
  readonly source: "media";
  /** Portable Media Asset document path, relative to the NLE Project file. */
  readonly asset: NleMediaAssetReference;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

export type NleComponentItem = NleItemBase & {
  readonly kind: "present";
  readonly source: "component";
  readonly component: NlePackageSymbol;
  /** Package-defined reusable value slots; Core validates identity, not value meaning. */
  readonly bindings?: readonly NleComponentBinding[];
  readonly parameters: CanonicalValue;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

/** One nested audiovisual composition. File revision and editor-view state stay outside it. */
export type NleCompoundItem = NleItemBase & {
  readonly kind: "present";
  readonly source: "composition";
  readonly composition: NleComposition;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

/** A source-owning contribution placed on the Timeline. */
export type NlePresentItem = NleMediaItem | NleComponentItem | NleCompoundItem;

/** A package Component that transforms the Picture or Audio accumulated below its Track position. */
export type NleAdjustmentItem = NleItemBase & {
  readonly kind: "adjustment";
  readonly component: NlePackageSymbol;
  readonly parameters: CanonicalValue;
};

export type NleItem = NlePresentItem | NleAdjustmentItem;

export type NleTrack = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio";
  readonly muted: boolean;
  /** Picture tracks and their items are ordered back-to-front. */
  readonly items: readonly NleItem[];
};

/** Direct overlap relation. Its active range is [incoming.start, outgoing.end). */
export type NleTransition = {
  readonly id: string;
  readonly outgoing: string;
  readonly incoming: string;
  readonly operator: NlePackageSymbol;
  readonly parameters: CanonicalValue;
};

/** Direct picture dependency. The matte Item is sampled but not painted as an independent layer. */
export type NleMatte = {
  readonly id: string;
  readonly content: string;
  readonly matte: string;
  readonly operator: NlePackageSymbol;
  readonly parameters: CanonicalValue;
};

/** Recursive, renderer-independent audiovisual content owned by an NLE document. */
export type NleComposition = {
  readonly id: string;
  readonly name: string;
  readonly canvas: NleCanvas;
  readonly componentValues: readonly NleComponentValue[];
  readonly pictureLayouts: readonly NlePictureLayoutValue[];
  readonly tracks: readonly NleTrack[];
  readonly transitions: readonly NleTransition[];
  readonly mattes: readonly NleMatte[];
};

/** Persistent file envelope. Compound Items embed only NleComposition, never this envelope. */
export type NleProject = NleComposition & {
  readonly format: "hypit.nle@1";
  readonly revision: number;
};

export type NleResolvedItemSource = {
  readonly source: ProgramSource;
  readonly pictureOutput?: string;
  readonly audioOutput?: string;
};

export type NleResolvedPictureAdjustment = {
  readonly operator: PictureOperator;
};

export type NleResolvedAudioAdjustment = {
  readonly operator: AudioOperator;
};

export type NleResolvedSignalReconstruction = {
  readonly reconstruction: SignalReconstruction;
};

export type NleLoweringContext = {
  readonly project: NleComposition;
  readonly track: NleTrack;
};

export type NleMediaLoweringContext = NleLoweringContext & {
  readonly item: NleMediaItem;
};

export type NleTransitionLoweringContext = NleLoweringContext & {
  readonly outgoing: NlePresentItem;
  readonly incoming: NlePresentItem;
  readonly domain: LocalTemporalDomain;
};

export type NleMatteLoweringContext = NleLoweringContext & {
  readonly content: NlePresentItem;
  readonly matte: NlePresentItem;
};

/** Package behavior is selected by the Host; it is not serialized into the NLE project. */
export type NleLoweringHost = {
  /** Resolve a file-backed asset previously opened by the Host. This seam performs no persistence. */
  readonly resolveMedia: (asset: NleMediaAssetReference, context: NleMediaLoweringContext) => NleResolvedMedia;
  readonly resolveComponent: (
    item: NleComponentItem,
    context: NleLoweringContext,
  ) => NleResolvedItemSource;
  readonly resolvePictureAdjustment: (
    item: NleAdjustmentItem,
    context: NleLoweringContext,
  ) => NleResolvedPictureAdjustment;
  readonly resolveAudioAdjustment: (
    item: NleAdjustmentItem,
    context: NleLoweringContext,
  ) => NleResolvedAudioAdjustment;
  readonly resolveSignalReconstruction: (
    reconstruction: NonNullable<NleAudioAppearance["reconstruction"]>,
    item: NlePresentItem,
    context: NleLoweringContext,
  ) => NleResolvedSignalReconstruction;
  readonly resolveTransition: (
    transition: NleTransition,
    context: NleTransitionLoweringContext,
  ) => NleResolvedPictureAdjustment;
  readonly resolveMatte: (
    matte: NleMatte,
    context: NleMatteLoweringContext,
  ) => NleResolvedPictureAdjustment;
};
