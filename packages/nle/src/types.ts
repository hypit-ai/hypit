import type {
  AudioOperator,
  PackageSymbol,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "@hypit/audiovisual";
import type { MediaInterpretation, ResolvedMedia } from "@hypit/media";
import type { ExactTemporalValue, TemporalMapPiece } from "@hypit/temporal/algebra";

export const nleProjectFormat = "hypit.nle-project";

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

/** One Component occurrence's explicit slot binding to a Project-owned value. */
export type NleComponentSharedValueBinding = {
  readonly slot: string;
  readonly ref: string;
};

/** Package selection for a non-default interpretation of one exact mapped signal read. */
export type NleSignalReconstruction = {
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

/** Package-owned parameters are either occurrence-local or explicitly linked to one Project value. */
export type NleParameterBinding =
  | { readonly kind: "inline"; readonly value: Readonly<Record<string, unknown>> }
  | { readonly kind: "shared"; readonly ref: string };

export type NlePictureLayoutReference = {
  readonly ref: string;
};

export type NlePictureAppearance = {
  /** Inline occurrence layout or one explicit Project-owned linked layout. */
  readonly layout: NlePictureLayout | NlePictureLayoutReference;
  readonly reconstruction?: NleSignalReconstruction;
  /** Occurrence-local Picture processing, ordered inner-to-outer. */
  readonly processes?: readonly NleProcess[];
};

export type NleAudioAppearance = {
  readonly reconstruction?: NleSignalReconstruction;
  /** Occurrence-local Audio processing, ordered inner-to-outer. */
  readonly processes?: readonly NleProcess[];
};

/** Item-local target-to-Source coordinates. A concrete Source domain attaches during lowering. */
export type NleTimeMapping = {
  readonly pieces: readonly TemporalMapPiece[];
};

export type NleProcess = {
  readonly id: string;
  readonly operator: PackageSymbol;
  readonly enabled: boolean;
  readonly parameters: NleParameterBinding;
  /** Item-local target coordinates selecting the package Operator's Control clock. */
  readonly controlTime: NleTimeMapping;
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
  readonly asset: NleMediaReference;
};

export type NleComponentItem = NlePresentBase & {
  readonly source: "component";
  readonly component: PackageSymbol;
  /** Reusable package-defined slots remain distinct from occurrence-local parameters. */
  readonly sharedValueBindings?: readonly NleComponentSharedValueBinding[];
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
export type NleAdjustItem = NleTimelineItemBase & NleProcess & {
  readonly kind: "adjust";
};

export type NleItem = NlePresentItem | NleAdjustItem;

export type NleTrack = {
  readonly id: string;
  readonly name: string;
  readonly kind: "picture" | "audio";
  readonly enabled: boolean;
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
  readonly operator: PackageSymbol;
  readonly parameters: Readonly<Record<string, unknown>>;
};

export type NleComposition = {
  readonly id: string;
  readonly name: string;
  readonly canvas: NleCanvas;
  readonly tracks: readonly NleTrack[];
  readonly transitions: readonly NleTransition[];
  readonly mattes: readonly NleMatte[];
};

export type NleProject = {
  readonly format: typeof nleProjectFormat;
  readonly id: string;
  readonly name: string;
  /** Default preview, lowering and delivery entry. */
  readonly rootComposition: string;
  /** Typed Project-wide values addressable from explicit slots in any Composition. */
  readonly sharedValues: readonly NleSharedValue[];
  readonly compositions: readonly NleComposition[];
};

export type NleResolvedItemSource = {
  readonly source: ProgramSource;
  readonly pictureOutput?: string;
  readonly audioOutput?: string;
};

export type NleLoweringContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
};

export type NleMediaLoweringContext = NleLoweringContext & (
  | { readonly kind: "item"; readonly item: NleMediaItem }
  | {
      readonly kind: "component-input";
      readonly item: NleComponentItem;
      readonly input: string;
    }
);

export type NleComponentLoweringContext = NleLoweringContext & {
  readonly item: NleComponentItem;
  /** Invocation-local resources resolved by the Host from the Item's persistent Media references. */
  readonly media: Readonly<Record<string, ResolvedMedia>>;
  /** Project values resolved by slot without merging them into occurrence-local parameters. */
  readonly values: Readonly<Record<string, NleComponentSharedValue>>;
};

export type NleSignalReconstructionLoweringContext = NleLoweringContext & {
  readonly item: NlePresentItem;
  readonly signal: "picture" | "audio";
  readonly output: string;
};

export type NleProcessLoweringContext = NleLoweringContext & {
  readonly process: NleProcess;
  /** Closed value resolved from the process's inline or Project-owned binding. */
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly scope:
    | { readonly kind: "occurrence"; readonly item: NlePresentItem }
    | { readonly kind: "adjust"; readonly item: NleAdjustItem };
  /** Stable package Control extent required by the persisted control-time relation. */
  readonly controlDuration: ExactTemporalValue;
};

export type NleTransitionLoweringContext = NleLoweringContext & {
  readonly outgoing: NlePresentItem;
  readonly incoming: NlePresentItem;
  readonly domain: import("@hypit/temporal/algebra").LocalTemporalDomain;
};

export type NleMatteLoweringContext = NleLoweringContext & {
  readonly content: NlePresentItem;
  readonly matte: NlePresentItem;
};

/** Resolution is explicit Host behavior; neither filesystem access nor package loading occurs in Core. */
export type NleLoweringHost = {
  readonly resolveMedia: (
    asset: NleMediaReference,
    context: NleMediaLoweringContext,
  ) => ResolvedMedia;
  readonly resolveComponent: (
    item: NleComponentItem,
    context: NleComponentLoweringContext,
  ) => NleResolvedItemSource;
  readonly resolveSignalReconstruction: (
    reconstruction: NleSignalReconstruction,
    context: NleSignalReconstructionLoweringContext,
  ) => SignalReconstruction;
  readonly resolvePictureOperator: (
    process: NleProcess,
    context: NleProcessLoweringContext,
  ) => PictureOperator;
  readonly resolveAudioOperator: (
    process: NleProcess,
    context: NleProcessLoweringContext,
  ) => AudioOperator;
  readonly resolveTransition: (
    transition: NleTransition,
    context: NleTransitionLoweringContext,
  ) => PictureOperator;
  readonly resolveMatte: (
    matte: NleMatte,
    context: NleMatteLoweringContext,
  ) => PictureOperator;
};

/** File-persistent Media facts accepted by the pure materialization planner. */
export type NleMediaInterpretation = MediaInterpretation;
