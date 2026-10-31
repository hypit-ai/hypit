import type {
  AudioLevelAutomation,
  AudioProcessProgram,
  AudioReconstructionProgram,
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
  readonly gain: number;
  readonly fadeInSamples: number;
  readonly fadeOutSamples: number;
};

/** A node reference inside the closed AudioProgram graph. Every node has one signal output. */
export type AudioProgramSignalRef = {
  readonly node: string;
};

export type AudioProgramNode =
  | { readonly kind: "silence"; readonly id: string }
  | { readonly kind: "source"; readonly id: string; readonly clip: AudioProgramClip }
  | { readonly kind: "mix"; readonly id: string; readonly inputs: readonly AudioProgramSignalRef[] }
  | {
      readonly kind: "process";
      readonly id: string;
      readonly inputs: Readonly<Record<string, AudioProgramSignalRef>>;
      readonly program: AudioProcessProgram;
    };

export type AudioProgramGraph = {
  readonly nodes: readonly AudioProgramNode[];
  readonly output: AudioProgramSignalRef;
};

/** Pure, provider-independent executable audio DAG lowered from one AudioComposition. */
export type AudioProgram = {
  readonly frameRate: MediaRational;
  readonly frameCount: number;
  readonly graph: AudioProgramGraph;
};

export type RenderAudioNeed = {
  readonly program: AudioProgram;
  readonly range?: FrameSpan;
};
