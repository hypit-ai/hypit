import type { AudioTrack } from "@hypit/composition";

export type AudioMixHeader = { readonly id: string };
export type AudioMixInputSpec = { readonly id: string; readonly gain: number };
export type AudioMixSet = {
  readonly inputs: readonly { readonly spec: AudioMixInputSpec; readonly track: AudioTrack }[];
};
