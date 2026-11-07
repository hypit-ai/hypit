import type { RefinementPackage } from "@hypit/refinement";
import type { ProducerPackage } from "@hypit/producer";
import { canonicalize } from "@hypit/protocol";
import type { Value } from "@hypit/protocol";

import { assertProgramSource } from "./occurrence.js";
import { assertAudioOperator, assertPictureOperator, assertSignalReconstruction } from "./operator.js";
import { assertAudiovisualProgram, audiovisualProgramSource } from "./program.js";
import { audiovisualProducers, audiovisualTypes } from "./manifest.js";
import type {
  AudioOperator,
  AudiovisualProgram,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audiovisualComponent = {
  refinements: [
    {
      type: audiovisualTypes.pictureOperator,
      handler: ({ value }) => assertPictureOperator(valueOf<PictureOperator>(value, "PictureOperator")),
    },
    {
      type: audiovisualTypes.audioOperator,
      handler: ({ value }) => assertAudioOperator(valueOf<AudioOperator>(value, "AudioOperator")),
    },
    {
      type: audiovisualTypes.signalReconstruction,
      handler: ({ value }) => assertSignalReconstruction(
        valueOf<SignalReconstruction>(value, "SignalReconstruction"),
      ),
    },
    {
      type: audiovisualTypes.programSource,
      handler: ({ value }) => assertProgramSource(valueOf<ProgramSource>(value, "ProgramSource")),
    },
    {
      type: audiovisualTypes.program,
      handler: ({ value }) => assertAudiovisualProgram(valueOf<AudiovisualProgram>(value, "AudiovisualProgram")),
    },
  ],
  producers: [{
    producer: audiovisualProducers.programSource,
    handler: ({ inputs }) => ({
      kind: "output",
      value: canonicalize(audiovisualProgramSource(
        valueOf<AudiovisualProgram>(inputs.program?.value, "AudiovisualProgram"),
      )),
    }),
  }],
} satisfies { refinements: RefinementPackage; producers: ProducerPackage };
