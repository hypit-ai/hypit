import type { ComponentPackage } from "@hypit/component-kit";
import type { SynchronizedMedia } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { SemanticTrack } from "@hypit/semantic-track";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";

import { audioTrackProducers, audioTrackTypes } from "./manifest.js";
import { appendProjectedAudioItem, assertAudioTrackProgram, createAudioTrackSet, finalizeAudioTrack, renderAudioTrack } from "./program.js";
import type { AudioClipSpec, AudioTrackHeader, AudioTrackProgram, AudioTrackSet } from "./types.js";
import type { TemporalWindow } from "@hypit/temporal";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

const base = (inputs: [AudioTrackSet, AudioTrackHeader, SemanticTrack, SynchronizedMedia, AudioClipSpec, TemporalWindow]) => output(appendProjectedAudioItem(...inputs));

export const audioTrackComponent = {
  producers: [
    { producer: audioTrackProducers.createSet, handler: () => ({ outputs: { set: output(createAudioTrackSet()) }, needs: {} }) },
    { producer: audioTrackProducers.appendItem, handler: ({ inputs }) => ({ outputs: { set: base([
      inline<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"), inline<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
      inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"), inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
      inline<AudioClipSpec>(inputs.spec?.value, "AudioClipSpec"),
      inline<TemporalWindow>(inputs.window?.value, "TemporalWindow"),
    ]) }, needs: {} }) },
    { producer: audioTrackProducers.finalize, handler: ({ inputs }) => ({ outputs: { program: output(finalizeAudioTrack(
      inline<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"), inline<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
    )) }, needs: {} }) },
    { producer: audioTrackProducers.render, handler: ({ inputs }) => ({ outputs: { track: output(renderAudioTrack(
      projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")), inline<AudioTrackProgram>(inputs.program?.value, "AudioTrackProgram"),
    )) }, needs: {} }) },
  ],
  validators: [{
    type: audioTrackTypes.program,
    handler: ({ value }) => assertAudioTrackProgram(inline<AudioTrackProgram>(value, "AudioTrackProgram")),
  }],
} satisfies ComponentPackage;
