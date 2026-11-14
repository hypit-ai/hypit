import type {
  AudioOperator,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "@hypit/audiovisual";
import type { PreparedMedia } from "@hypit/media";
import type { CanonicalValue } from "@hypit/protocol";
import type { ModuleRef } from "@hypit/module";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMapPiece,
} from "@hypit/temporal/algebra";

export const nleProjectFormat = "hypit.nle@1";

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

/** One package-defined slot referencing an explicit project-owned shared value. */
export type NleComponentSharedValueReference = {
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

/**
 * One authored use of a package-owned Operator. The definition/application distinction mirrors
 * ProgramSource/Occurrence without turning the NLE Project into an arbitrary signal graph.
 */
export type NleOperatorApplication = {
  readonly id: string;
  readonly operator: NlePackageSymbol;
  readonly parameters: CanonicalValue;
  /** Item-local target coordinates selecting the package Operator's stable Control clock. */
  readonly controlTime: NleTimeMapping;
};

/** Unary Picture processing applied only to one Present occurrence, ordered inner-to-outer. */
export type NlePictureOperatorApplication = NleOperatorApplication;
/** Unary Audio processing applied only to one Present occurrence, ordered inner-to-outer. */
export type NleAudioOperatorApplication = NleOperatorApplication;

export type NlePictureAppearance = {
  /** Inline occurrence layout or one explicit project-owned linked layout. */
  readonly layout: NlePictureLayout | NlePictureLayoutReference;
  /** Occurrence-local unary processing after fitting and before Programme-space placement. */
  readonly operators?: readonly NlePictureOperatorApplication[];
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
  /** Occurrence-local unary processing after Source reconstruction and before Programme mixing. */
  readonly operators?: readonly NleAudioOperatorApplication[];
};

/** Direct Item-local target-to-domain coordinates. Concrete Source or Control domains attach only during lowering. */
export type NleTimeMapping = {
  readonly pieces: readonly TemporalMapPiece[];
};

type NleTimelineItemBase = {
  readonly id: string;
  /** Optional author-facing occurrence name; it never changes Programme output. */
  readonly name?: string;
  /** Exact Programme-local position. */
  readonly start: ExactTemporalValue;
  /** Exact visible duration. */
  readonly duration: ExactTemporalValue;
  readonly enabled: boolean;
};

type NlePresentItemBase = NleTimelineItemBase & {
  /** Exact Item-local target-to-Source coordinates over [0, duration]. */
  readonly sourceTime: NleTimeMapping;
};

export type NleMediaItem = NlePresentItemBase & {
  readonly kind: "present";
  readonly source: "media";
  /** Portable Media Asset document path, relative to the NLE Project file. */
  readonly asset: NleMediaAssetReference;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

export type NleComponentItem = NlePresentItemBase & {
  readonly kind: "present";
  readonly source: "component";
  readonly component: NlePackageSymbol;
  /** Package-defined reusable value slots; Core validates identity, not value meaning. */
  readonly sharedValues?: readonly NleComponentSharedValueReference[];
  /** Occurrence-local names for project Media Assets consumed by this Component Source. */
  readonly media?: Readonly<Record<string, NleMediaAssetReference>>;
  readonly parameters: CanonicalValue;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

/** One nested audiovisual composition. File revision and editor-view state stay outside it. */
export type NleCompoundItem = NlePresentItemBase & {
  readonly kind: "present";
  readonly source: "composition";
  readonly composition: NleComposition;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

/** A source-owning contribution placed on the Timeline. */
export type NlePresentItem = NleMediaItem | NleComponentItem | NleCompoundItem;

/** One Programme-scoped Operator Application over the Picture or Audio accumulated below its Track position. */
export type NleAdjustmentItem = NleTimelineItemBase & NleOperatorApplication & {
  readonly kind: "adjustment";
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
  readonly format: typeof nleProjectFormat;
  readonly revision: number;
};

export type NleResolvedItemSource = {
  readonly source: ProgramSource;
  readonly pictureOutput?: string;
  readonly audioOutput?: string;
};

export type NleResolvedPictureOperator = {
  readonly operator: PictureOperator;
};

export type NleResolvedAudioOperator = {
  readonly operator: AudioOperator;
};

export type NleResolvedSignalReconstruction = {
  readonly reconstruction: SignalReconstruction;
};

export type NleLoweringContext = {
  readonly project: NleComposition;
  readonly track: NleTrack;
};

/** Package resolution receives prepared Media, never project paths or filesystem access. */
export type NleComponentLoweringContext = NleLoweringContext & {
  readonly media: Readonly<Record<string, NleResolvedMedia>>;
};

export type NleOperatorLoweringContext = NleLoweringContext & {
  readonly application: NleOperatorApplication;
  readonly scope:
    | { readonly kind: "occurrence"; readonly item: NlePresentItem }
    | { readonly kind: "adjustment"; readonly item: NleAdjustmentItem };
  /** Stable package Control extent required by the persisted control-time Mapping. */
  readonly controlDuration: ExactTemporalValue;
};

export type NleMediaLoweringContext = NleLoweringContext & (
  | {
      readonly kind: "item";
      readonly item: NleMediaItem;
    }
  | {
      readonly kind: "component-input";
      readonly item: NleComponentItem;
      readonly input: string;
    }
);

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
    context: NleComponentLoweringContext,
  ) => NleResolvedItemSource;
  readonly resolvePictureOperator: (
    application: NleOperatorApplication,
    context: NleOperatorLoweringContext,
  ) => NleResolvedPictureOperator;
  readonly resolveAudioOperator: (
    application: NleOperatorApplication,
    context: NleOperatorLoweringContext,
  ) => NleResolvedAudioOperator;
  readonly resolveSignalReconstruction: (
    reconstruction: NonNullable<NleAudioAppearance["reconstruction"]>,
    item: NlePresentItem,
    context: NleLoweringContext,
  ) => NleResolvedSignalReconstruction;
  readonly resolveTransition: (
    transition: NleTransition,
    context: NleTransitionLoweringContext,
  ) => NleResolvedPictureOperator;
  readonly resolveMatte: (
    matte: NleMatte,
    context: NleMatteLoweringContext,
  ) => NleResolvedPictureOperator;
};
