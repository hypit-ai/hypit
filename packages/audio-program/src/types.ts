import type { OperatorTemporalSupport, SignalOperatorProgram } from "@hypit/audiovisual";
import type { PreparedAudioSource } from "@hypit/media";
import type { LocalTemporalDomain, TemporalMap, TemporalRange } from "@hypit/temporal/algebra";

export type AudioProgramMediaSource = {
  readonly id: string;
  readonly source: PreparedAudioSource;
  /** Prepared-local to selected source-presentation relation. */
  readonly preparation: TemporalMap;
};

/** A node reference inside the closed AudioProgram graph. Every node has one signal output. */
export type AudioProgramSignalRef = {
  readonly node: string;
};

export type AudioProgramNode =
  | { readonly kind: "silence"; readonly id: string }
  | { readonly kind: "source"; readonly id: string; readonly media: AudioProgramMediaSource }
  | {
      /** One occurrence of an already closed signal Programme in this Programme domain. */
      readonly kind: "program";
      readonly id: string;
      readonly program: AudioProgram;
      /** Target-local to child Programme-local sampling relation. */
      readonly sampling: TemporalMap;
      /** Package-owned reconstruction of this mapped signal use. */
      readonly reconstruction?: SignalOperatorProgram;
      /** Exact placement of sampling target-local zero in this Programme. */
      readonly target: TemporalRange;
    }
  | {
      readonly kind: "restrict";
      readonly id: string;
      readonly input: AudioProgramSignalRef;
      readonly range: TemporalRange;
    }
  | { readonly kind: "mix"; readonly id: string; readonly inputs: readonly AudioProgramSignalRef[] }
  | {
      readonly kind: "process";
      readonly id: string;
      readonly inputs: Readonly<Record<string, AudioProgramSignalRef>>;
      readonly program: SignalOperatorProgram;
      readonly temporalSupport: OperatorTemporalSupport;
      /** Programme-local positions mapped into package-owned temporal Control domains. */
      readonly controlMappings: Readonly<Record<string, TemporalMap>>;
    };

export type AudioProgramGraph = {
  readonly nodes: readonly AudioProgramNode[];
  readonly output: AudioProgramSignalRef;
};

export type AudioOutputSampling = {
  readonly sampleRate: number;
};

/** Pure, provider-independent executable audio DAG on one exact temporal Domain. */
export type AudioProgram = {
  readonly domain: LocalTemporalDomain;
  readonly sampling: AudioOutputSampling;
  readonly graph: AudioProgramGraph;
};

export type RenderAudioNeed = {
  readonly program: AudioProgram;
  readonly range?: TemporalRange;
};
