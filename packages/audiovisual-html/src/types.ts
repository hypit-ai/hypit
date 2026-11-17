import type {
  AudiovisualProgram,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "@hypit/audiovisual";
import type {
  HtmlCanvas,
  HtmlFrameRate,
  HtmlPictureReconstruction,
  HtmlVisual,
} from "@hypit/html-program";
import type { ResolvedMedia } from "@hypit/media";
import type { TemporalRange } from "@hypit/temporal/algebra";

export type AudiovisualHtmlSource = {
  readonly source: string;
  readonly output: string;
  readonly implementation:
    | { readonly kind: "visual"; readonly visual: HtmlVisual }
    | { readonly kind: "media"; readonly media: ResolvedMedia };
};

export type AudiovisualHtmlOperator = {
  readonly operator: string;
  readonly visual: HtmlVisual;
};

export type AudiovisualHtmlReconstruction = {
  readonly occurrence: string;
  readonly output: string;
  readonly reconstruction: HtmlPictureReconstruction;
};

export type AudiovisualHtmlLink = {
  readonly program: AudiovisualProgram;
  readonly sources: readonly AudiovisualHtmlSource[];
  readonly operators: readonly AudiovisualHtmlOperator[];
  readonly reconstructions: readonly AudiovisualHtmlReconstruction[];
};

export type AudiovisualHtmlOutput = {
  readonly frameRate: HtmlFrameRate;
  readonly canvas: HtmlCanvas;
  readonly range?: TemporalRange;
};

export type AudiovisualHtmlSourceCompiler = {
  readonly symbol: string;
  compile(source: ProgramSource, output: string): HtmlVisual;
};

export type AudiovisualHtmlOperatorCompiler = {
  readonly symbol: string;
  compile(operator: PictureOperator): HtmlVisual;
};

export type AudiovisualHtmlReconstructionCompiler = {
  readonly symbol: string;
  compile(reconstruction: SignalReconstruction): HtmlPictureReconstruction;
};

export const audiovisualHtmlContributionKind = "hypit.audiovisual-html";

export type AudiovisualHtmlContribution = {
  readonly kind: typeof audiovisualHtmlContributionKind;
  readonly package: string;
  readonly sources?: readonly AudiovisualHtmlSourceCompiler[];
  readonly operators?: readonly AudiovisualHtmlOperatorCompiler[];
  readonly reconstructions?: readonly AudiovisualHtmlReconstructionCompiler[];
};
