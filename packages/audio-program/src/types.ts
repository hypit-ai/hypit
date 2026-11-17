import type { ResolvedMedia } from "@hypit/media";
import type { LocalTemporalDomain, TemporalMap, TemporalRange } from "@hypit/temporal";

export type AudioFilterProgram = {
  /** One filter graph fragment using `{{input:name}}`, `{{control:name}}` and `{{output}}`. */
  readonly filter: string;
  readonly controls: Readonly<Record<string, TemporalMap>>;
};

export type AudioProgramNode =
  | { readonly kind: "silence"; readonly id: string }
  | {
      readonly kind: "media";
      readonly id: string;
      readonly media: ResolvedMedia;
      readonly output: string;
      readonly targetStart: import("@hypit/temporal").ExactTemporalValue;
      readonly targetRange: TemporalRange;
      readonly mapping: TemporalMap;
    }
  | { readonly kind: "restrict"; readonly id: string; readonly input: string; readonly range: TemporalRange }
  | { readonly kind: "mix"; readonly id: string; readonly inputs: readonly string[] }
  | {
      readonly kind: "process";
      readonly id: string;
      readonly inputs: Readonly<Record<string, string>>;
      readonly program: AudioFilterProgram;
    };

export type AudioProgram = {
  readonly domain: LocalTemporalDomain;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly nodes: Readonly<Record<string, AudioProgramNode>>;
  readonly root: string;
};

export type RenderedAudio = {
  readonly resource: import("@hypit/media").MediaResource;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly sampleFrames: number;
};
