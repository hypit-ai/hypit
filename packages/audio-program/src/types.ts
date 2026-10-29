import type {
  AudioLevelAutomation,
  AudioProcessProgram,
  AudioReconstructionProgram,
  AudioSignalRef,
} from "@hypit/composition";
import type { MediaRational, PreparedAudioSource } from "@hypit/media";
import type { FrameSpan } from "@hypit/timeline";
import type { TemporalMap, TemporalRange } from "@hypit/temporal";

export type AudioProgramClip = AudioLevelAutomation & {
  readonly id: string;
  readonly source: PreparedAudioSource;
  /** Prepared-local to selected source-presentation relation. */
  readonly preparation: TemporalMap;
  /** Occurrence-local to PreparedMedia-local relation. Gaps are silence. */
  readonly sampling: TemporalMap;
  /** Explicit signal reconstruction; omission remains ordinary point sampling. */
  readonly reconstruction?: AudioReconstructionProgram;
  /** Exact absolute programme range; sample boundaries are its 48 kHz projection. */
  readonly target: TemporalRange;
  readonly targetStartSample: number;
  readonly targetEndSampleExclusive: number;
  /** Complete owning Clip Window; fades do not restart at sampling-piece boundaries. */
  readonly mixStartSample: number;
  readonly mixEndSampleExclusive: number;
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
};

export type AudioProgramNode =
  | { readonly kind: "silence"; readonly id: string }
  | { readonly kind: "source"; readonly id: string; readonly clip: AudioProgramClip }
  | {
      readonly kind: "composition";
      readonly id: string;
      readonly program: AudioProgram;
      readonly target: TemporalRange;
      readonly targetStartSample: number;
      readonly targetEndSampleExclusive: number;
      readonly sampling: TemporalMap;
      readonly reconstruction?: AudioReconstructionProgram;
      readonly gain: number;
      readonly fadeInSamples: number;
      readonly fadeOutSamples: number;
    }
  | { readonly kind: "mix"; readonly id: string; readonly inputs: readonly AudioSignalRef[] }
  | {
      readonly kind: "process";
      readonly id: string;
      readonly inputs: Readonly<Record<string, AudioSignalRef>>;
      readonly program: AudioProcessProgram;
    };

export type AudioProgramGraph = {
  readonly nodes: readonly AudioProgramNode[];
  readonly output: AudioSignalRef;
};

/** Pure, provider-independent executable audio DAG lowered from one AudioComposition. */
export type AudioProgram = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly sampleRate: 48_000;
  readonly sampleFrames: number;
  readonly graph: AudioProgramGraph;
};

/** One gain-only route through an AudioProgram, used by endpoints with a flat additive evaluator. */
export type AudioProgramGainRoute = {
  readonly id: string;
  readonly clip: AudioProgramClip;
  readonly gain: number;
};

export type RenderAudioNeed = {
  readonly program: AudioProgram;
  readonly range?: FrameSpan;
};
