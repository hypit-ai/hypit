import type { ComponentPackage } from "@narratage/component-kit";
import type { SynchronizedMedia } from "@narratage/media";
import type { NarrativeMomentRef, NarrativeSelectionRef } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import { canonicalize } from "@narratage/protocol";
import type { StoredValue } from "@narratage/protocol";
import type { CompleteSemanticMap } from "@narratage/semantic-map";

import { audioTrackProducers, audioTrackTypes } from "./manifest.js";
import {
  appendMomentAudioItem,
  appendProgramAudioItem,
  appendSelectionAudioItem,
  assertAudioTrackProgram,
  audioTrackImplementationDigests,
  audioTrackValidatorDigests,
  createAudioTrackSet,
  finalizeAudioTrack,
  renderAudioTrack,
} from "./program.js";
import type { AudioClipSpec, AudioTrackHeader, AudioTrackProgram, AudioTrackSet } from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

const base = (inputs: Parameters<typeof appendProgramAudioItem>) => output(appendProgramAudioItem(...inputs));

export const audioTrackComponent = {
  name: "@narratage/audio-track",
  producers: [
    { producer: audioTrackProducers.createSet, implementationDigest: audioTrackImplementationDigests.createSet, handler: () => ({ outputs: { set: output(createAudioTrackSet()) }, needs: {} }) },
    { producer: audioTrackProducers.appendProgram, implementationDigest: audioTrackImplementationDigests.appendProgram, handler: ({ inputs }) => ({ outputs: { set: base([
      inline<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"), inline<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
      inline<AudioClipSpec>(inputs.spec?.value, "AudioClipSpec"),
    ]) }, needs: {} }) },
    { producer: audioTrackProducers.appendSelection, implementationDigest: audioTrackImplementationDigests.appendSelection, handler: ({ inputs }) => ({ outputs: { set: output(appendSelectionAudioItem(
      inline<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"), inline<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
      inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"), inline<NarrativeSelectionRef>(inputs.selection?.value, "NarrativeSelection"),
      inline<AudioClipSpec>(inputs.spec?.value, "AudioClipSpec"),
    )) }, needs: {} }) },
    { producer: audioTrackProducers.appendMoment, implementationDigest: audioTrackImplementationDigests.appendMoment, handler: ({ inputs }) => ({ outputs: { set: output(appendMomentAudioItem(
      inline<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"), inline<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<SynchronizedMedia>(inputs.media?.value, "SynchronizedMedia"),
      inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"), inline<NarrativeMomentRef>(inputs.moment?.value, "NarrativeMoment"),
      inline<AudioClipSpec>(inputs.spec?.value, "AudioClipSpec"),
    )) }, needs: {} }) },
    { producer: audioTrackProducers.finalize, implementationDigest: audioTrackImplementationDigests.finalize, handler: ({ inputs }) => ({ outputs: { program: output(finalizeAudioTrack(
      inline<AudioTrackSet>(inputs.set?.value, "AudioTrackSet"), inline<AudioTrackHeader>(inputs.header?.value, "AudioTrackHeader"),
    )) }, needs: {} }) },
    { producer: audioTrackProducers.render, implementationDigest: audioTrackImplementationDigests.render, handler: ({ inputs }) => ({ outputs: { track: output(renderAudioTrack(
      inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"), inline<AudioTrackProgram>(inputs.program?.value, "AudioTrackProgram"),
    )) }, needs: {} }) },
  ],
  validators: [{
    type: audioTrackTypes.program,
    implementationDigest: audioTrackValidatorDigests.program,
    handler: ({ value }) => assertAudioTrackProgram(inline<AudioTrackProgram>(value, "AudioTrackProgram")),
  }],
} satisfies ComponentPackage;
