import type { AudioOperator, PictureOperator, ProgramSource } from "@hypit/audiovisual";
import type { PreparedMedia } from "@hypit/media";
import type { CanonicalValue, ModuleRef } from "@hypit/protocol";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMapPiece,
  TemporalRate,
} from "@hypit/temporal/algebra";

/** Editor display and snap grid. It never changes the meaning of persisted exact times. */
export type NleEditRate = TemporalRate;

export type NleCanvas = {
  readonly width: number;
  readonly height: number;
  readonly clearColor: string;
};

export type NlePackageSymbol = {
  readonly module: ModuleRef;
  readonly name: string;
};

export type NleMediaAssetReference = {
  readonly path: string;
};

/** Ephemeral media value supplied by the Host; it is never serialized in an NLE Project. */
export type NleResolvedMedia = PreparedMedia;

/** File-persistent media facts sufficient to create a direct NLE edit. */
export type NleMediaInterpretation = Omit<PreparedMedia, "source">;

export type NleMedia = {
  readonly id: string;
  readonly name: string;
  /** Portable Media Asset document path, relative to the NLE Project file. */
  readonly asset: NleMediaAssetReference;
};

export type NlePictureLayout = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fit: "fill" | "contain" | "cover";
};

export type NleEffect = {
  readonly id: string;
  readonly effect: NlePackageSymbol;
  readonly parameters: CanonicalValue;
};

export type NlePictureAppearance = {
  readonly layout: NlePictureLayout;
  /** Ordered inner-to-outer. */
  readonly effects: readonly NleEffect[];
};

export type NleAudioAppearance = {
  /** Ordered source-to-output. Package code owns every effect's behavior and parameter spelling. */
  readonly effects: readonly NleEffect[];
};

/** Direct Item-local target-to-Source coordinates. Concrete Source domains are attached only during lowering. */
export type NleSourceTime = {
  readonly pieces: readonly TemporalMapPiece[];
};

type NleItemBase = {
  readonly id: string;
  /** Exact Programme-local position. */
  readonly start: ExactTemporalValue;
  /** Exact visible duration. */
  readonly duration: ExactTemporalValue;
  /** Exact source-time facts over the Item-local interval [0, duration]. */
  readonly sourceTime: NleSourceTime;
  readonly enabled: boolean;
};

export type NleMediaItem = NleItemBase & {
  readonly kind: "media";
  readonly media: string;
  /** Required on a Picture track and absent on an Audio track. */
  readonly picture?: NlePictureAppearance;
  /** Presence includes the selected Audio output in the Programme mix. */
  readonly audio?: NleAudioAppearance;
};

export type NleComponentItem = NleItemBase & {
  readonly kind: "component";
  readonly component: NlePackageSymbol;
  readonly parameters: CanonicalValue;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

/** One nested flat NLE Project. It closes as an ordinary multi-output AVIR Source. */
export type NleCompoundItem = NleItemBase & {
  readonly kind: "compound";
  readonly project: NleProject;
  readonly picture?: NlePictureAppearance;
  readonly audio?: NleAudioAppearance;
};

export type NleItem = NleMediaItem | NleComponentItem | NleCompoundItem;

export type NleTrack = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio";
  readonly locked: boolean;
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

/** Editing-only selection relation; it has no AVIR meaning. */
export type NleGroup = {
  readonly id: string;
  readonly name: string;
  readonly items: readonly string[];
};

export type NleProject = {
  readonly format: "hypit.nle@1";
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  /** Editor display and snap grid; Programme time remains exact and independent of this rate. */
  readonly editRate: NleEditRate;
  readonly canvas: NleCanvas;
  readonly media: readonly NleMedia[];
  readonly tracks: readonly NleTrack[];
  readonly transitions: readonly NleTransition[];
  readonly mattes: readonly NleMatte[];
  readonly groups: readonly NleGroup[];
};

export type NleResolvedItemSource = {
  readonly source: ProgramSource;
  readonly pictureOutput?: string;
  readonly audioOutput?: string;
};

export type NleResolvedEffect = {
  readonly operator: PictureOperator;
};

export type NleResolvedAudioEffect = {
  readonly operator: AudioOperator;
};

export type NleLoweringContext = {
  readonly project: NleProject;
  readonly track: NleTrack;
};

export type NleMediaLoweringContext = NleLoweringContext & {
  readonly item: NleMediaItem;
};

export type NleTransitionLoweringContext = NleLoweringContext & {
  readonly outgoing: NleItem;
  readonly incoming: NleItem;
  readonly domain: LocalTemporalDomain;
};

export type NleMatteLoweringContext = NleLoweringContext & {
  readonly content: NleItem;
  readonly matte: NleItem;
};

/** Package behavior is selected by the Host; it is not serialized into the NLE project. */
export type NleLoweringHost = {
  /** Resolve a file-backed asset previously opened by the Host. This seam performs no persistence. */
  readonly resolveMedia: (media: NleMedia, context: NleMediaLoweringContext) => NleResolvedMedia;
  readonly resolveComponent: (item: NleComponentItem, context: NleLoweringContext) => NleResolvedItemSource;
  readonly resolveEffect: (
    effect: NleEffect,
    item: NleItem,
    context: NleLoweringContext,
  ) => NleResolvedEffect;
  readonly resolveAudioEffect: (
    effect: NleEffect,
    item: NleItem,
    context: NleLoweringContext,
  ) => NleResolvedAudioEffect;
  readonly resolveTransition: (
    transition: NleTransition,
    context: NleTransitionLoweringContext,
  ) => NleResolvedEffect;
  readonly resolveMatte: (
    matte: NleMatte,
    context: NleMatteLoweringContext,
  ) => NleResolvedEffect;
};
