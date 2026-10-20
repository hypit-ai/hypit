import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { SynchronizedMedia } from "@hypit/media";
import type { TemporalWindow } from "@hypit/temporal";
import type { Timeline } from "@hypit/timeline";

import { audioTrackProducers, audioTrackTypes } from "./manifest.js";
import {
  appendAudioClip,
  assertAudioTrackProgram,
  createAudioTrackSet,
  finalizeAudioTrack,
  renderAudioTrack,
} from "./program.js";
import type { AudioClipSpec, AudioTrackHeader, AudioTrackProgram, AudioTrackSet } from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}
const output = (value: unknown) => ((canonicalize(value)));

export const audioTrackComponent = {
  producers: [
    { producer: audioTrackProducers.createSet, handler: () => ({ kind: "output", value: output(createAudioTrackSet()) }) },
    { producer: audioTrackProducers.appendClip, handler: ({ inputs }) => ({ kind: "output", value: output(
      appendAudioClip(
        valueOf<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"),
        valueOf<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
        valueOf<AudioClipSpec>(inputs.spec?.value, "AudioClipSpec"),
        valueOf<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
      ),
    ) }) },
    { producer: audioTrackProducers.finalize, handler: ({ inputs }) => ({ kind: "output", value: output(finalizeAudioTrack(
      valueOf<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"),
      valueOf<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
    )) }) },
    { producer: audioTrackProducers.render, handler: ({ inputs }) => ({ kind: "output", value: output(renderAudioTrack(
      valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      valueOf<AudioTrackProgram>(inputs.program?.value, "AudioTrackProgram"),
    )) }) },
  ],
  refinements: [{
    type: audioTrackTypes.program,
    handler: ({ value }) => assertAudioTrackProgram(valueOf<AudioTrackProgram>(value, "AudioTrackProgram")),
  }],
} satisfies ProducerPackage & RefinementPackage;
