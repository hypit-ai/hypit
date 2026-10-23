import type { AudioTrack } from "@hypit/composition";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Timeline } from "@hypit/timeline";
import { audioMixProducers, audioMixTypes } from "./manifest.js";
import { appendAudioMixInput, assertAudioMixSet, createAudioMixSet, finalizeAudioMix, sealAudioMixHeader, sealAudioMixInputSpec } from "./program.js";
import type { AudioMixHeader, AudioMixInputSpec, AudioMixSet } from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audioMixComponent = {
  producers: [
    { producer: audioMixProducers.createSet, handler: () => ({ kind: "output", value: canonicalize(createAudioMixSet()) }) },
    { producer: audioMixProducers.appendInput, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(appendAudioMixInput(
      valueOf<AudioMixSet>(inputs.set?.value, "AudioMixSet"), valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<AudioMixInputSpec>(inputs.spec?.value, "AudioMixInputSpec"), valueOf<AudioTrack>(inputs.track?.value, "AudioTrack"),
    )) }) },
    { producer: audioMixProducers.finalize, handler: ({ inputs }) => ({ kind: "output", value: canonicalize(finalizeAudioMix(
      valueOf<AudioMixSet>(inputs.set?.value, "AudioMixSet"), valueOf<AudioMixHeader>(inputs.header?.value, "AudioMixHeader"),
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
    )) }) },
  ],
  refinements: [
    { type: audioMixTypes.header, handler: ({ value }) => { sealAudioMixHeader(valueOf(value, "AudioMixHeader")); } },
    { type: audioMixTypes.inputSpec, handler: ({ value }) => { sealAudioMixInputSpec(valueOf(value, "AudioMixInputSpec")); } },
    { type: audioMixTypes.set,
      handler: ({ value }) => assertAudioMixSet(valueOf<AudioMixSet>(value, "AudioMixSet")) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
