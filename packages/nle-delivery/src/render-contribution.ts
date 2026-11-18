import type { AudioFilterProgram } from "@hypit/audio-program";
import type { HtmlPictureReconstruction, HtmlVisual } from "@hypit/html-program";
import type { ResolvedMedia } from "@hypit/media";
import type {
  NleAdjustItem, NleComponentItem, NleComposition, NleMatte, NleMediaReference,
  NlePictureRect, NlePresentItem, NleProcess, NleProject, NlePictureReconstruction, NleTrack, NleTransition,
} from "@hypit/nle";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export type NleRenderContext = {
  readonly project: NleProject;
  readonly composition: NleComposition;
  readonly track: NleTrack;
};

export type NleComponentRenderContext = NleRenderContext & {
  readonly item: NleComponentItem;
  /** Invocation-local resources resolved by the Host from the Item's persistent Media references. */
  readonly media: Readonly<Record<string, ResolvedMedia>>;
  /** Inline and shared slot bindings resolved to the same closed package values. */
  readonly values: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
};

export type NlePictureReconstructionContext = NleRenderContext & {
  readonly item: NlePresentItem;
};

export type NleProcessRenderContext = NleRenderContext & {
  readonly process: NleProcess;
  /** Closed value resolved from the process's inline or Project-owned binding. */
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly scope:
    | { readonly kind: "occurrence"; readonly item: NlePresentItem }
    | { readonly kind: "adjust"; readonly item: NleAdjustItem };
  /** Stable package Control extent required by the persisted control-time relation. */
  readonly controlDuration: ExactTemporalValue;
};

export type NleTransitionRenderContext = NleRenderContext & {
  readonly outgoing: NlePresentItem;
  readonly incoming: NlePresentItem;
  readonly domain: import("@hypit/temporal/algebra").LocalTemporalDomain;
};

export type NleMatteRenderContext = NleRenderContext & {
  readonly content: NlePresentItem;
  readonly matte: NlePresentItem;
};

export type NleComponentPicture = {
  readonly region: NlePictureRect;
  /** A Picture without a source duration is constant. */
  readonly duration?: ExactTemporalValue;
  readonly visual: HtmlVisual;
};

export type NlePictureEffect = {
  readonly visual: HtmlVisual;
  readonly controls?: readonly string[];
};

export type NleAudioEffect = {
  readonly filter: AudioFilterProgram["filter"];
  readonly controls?: readonly string[];
};

type RenderImplementation<Value, Context, Output> = {
  readonly symbol: string;
  render(value: Value, context: Context): Output;
};

export const nleRenderContributionKind = "hypit.nle-render";

export type NleRenderContribution = {
  readonly components?: readonly RenderImplementation<NleComponentItem, NleComponentRenderContext, NleComponentPicture>[];
  readonly pictureProcesses?: readonly RenderImplementation<NleProcess, NleProcessRenderContext, NlePictureEffect>[];
  readonly audioProcesses?: readonly RenderImplementation<NleProcess, NleProcessRenderContext, NleAudioEffect>[];
  readonly transitions?: readonly RenderImplementation<NleTransition, NleTransitionRenderContext, NlePictureEffect>[];
  readonly mattes?: readonly RenderImplementation<NleMatte, NleMatteRenderContext, NlePictureEffect>[];
  readonly pictureReconstructions?: readonly RenderImplementation<
    NlePictureReconstruction, NlePictureReconstructionContext, HtmlPictureReconstruction
  >[];
};

export type SelectedNleRenderContribution = { readonly package: string; readonly value: NleRenderContribution };

export type ResolveNleMedia = (reference: NleMediaReference) => ResolvedMedia;
