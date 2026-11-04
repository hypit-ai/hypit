import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type {
  AudioOperator,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "@hypit/audiovisual";

import {
  appendAudiovisualAuthorAudioOperator,
  appendAudiovisualAuthorPictureOperator,
  appendAudiovisualAuthorReconstruction,
  appendAudiovisualAuthorSource,
  assertAudiovisualAuthorBindingSet,
  assertAudiovisualAuthorOperatorBinding,
  assertAudiovisualAuthorReconstructionBinding,
  assertAudiovisualAuthorSourceBinding,
  createAudiovisualAuthorBindingSet,
} from "./bindings.js";
import { compileAudiovisualAuthorSpec } from "./compile.js";
import { audiovisualAuthorProducers, audiovisualAuthorTypes } from "./manifest.js";
import type {
  AudiovisualAuthorBindingSet,
  AudiovisualAuthorOperatorBinding,
  AudiovisualAuthorReconstructionBinding,
  AudiovisualAuthorSourceBinding,
  AudiovisualAuthorSpec,
} from "./types.js";
import { assertAudiovisualAuthorSpec } from "./validation.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audiovisualAuthorComponent = {
  refinements: [
    {
      type: audiovisualAuthorTypes.spec,
      handler: ({ value }) => assertAudiovisualAuthorSpec(
        valueOf<AudiovisualAuthorSpec>(value, "AudiovisualAuthorSpec"),
      ),
    },
    {
      type: audiovisualAuthorTypes.operatorBinding,
      handler: ({ value }) => assertAudiovisualAuthorOperatorBinding(
        valueOf<AudiovisualAuthorOperatorBinding>(value, "AudiovisualAuthorOperatorBinding"),
      ),
    },
    {
      type: audiovisualAuthorTypes.reconstructionBinding,
      handler: ({ value }) => assertAudiovisualAuthorReconstructionBinding(
        valueOf<AudiovisualAuthorReconstructionBinding>(value,
          "AudiovisualAuthorReconstructionBinding"),
      ),
    },
    {
      type: audiovisualAuthorTypes.sourceBinding,
      handler: ({ value }) => assertAudiovisualAuthorSourceBinding(
        valueOf<AudiovisualAuthorSourceBinding>(value, "AudiovisualAuthorSourceBinding"),
      ),
    },
    {
      type: audiovisualAuthorTypes.bindingSet,
      handler: ({ value }) => assertAudiovisualAuthorBindingSet(
        valueOf<AudiovisualAuthorBindingSet>(value, "AudiovisualAuthorBindingSet"),
      ),
    },
  ],
  producers: [
    {
      producer: audiovisualAuthorProducers.createBindings,
      handler: () => ({
        kind: "output",
        value: canonicalize(createAudiovisualAuthorBindingSet()),
      }),
    },
    {
      producer: audiovisualAuthorProducers.appendPictureOperator,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(appendAudiovisualAuthorPictureOperator(
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<AudiovisualAuthorOperatorBinding>(inputs.binding?.value, "AudiovisualAuthorOperatorBinding"),
          valueOf<PictureOperator>(inputs.operator?.value, "PictureOperator"),
        )),
      }),
    },
    {
      producer: audiovisualAuthorProducers.appendAudioOperator,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(appendAudiovisualAuthorAudioOperator(
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<AudiovisualAuthorOperatorBinding>(inputs.binding?.value, "AudiovisualAuthorOperatorBinding"),
          valueOf<AudioOperator>(inputs.operator?.value, "AudioOperator"),
        )),
      }),
    },
    {
      producer: audiovisualAuthorProducers.appendReconstruction,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(appendAudiovisualAuthorReconstruction(
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<AudiovisualAuthorReconstructionBinding>(inputs.binding?.value,
            "AudiovisualAuthorReconstructionBinding"),
          valueOf<SignalReconstruction>(inputs.reconstruction?.value, "SignalReconstruction"),
        )),
      }),
    },
    {
      producer: audiovisualAuthorProducers.appendSource,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(appendAudiovisualAuthorSource(
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<AudiovisualAuthorSourceBinding>(inputs.binding?.value, "AudiovisualAuthorSourceBinding"),
          valueOf<ProgramSource>(inputs.source?.value, "ProgramSource"),
        )),
      }),
    },
    {
      producer: audiovisualAuthorProducers.closeProgram,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(compileAudiovisualAuthorSpec(
          valueOf<AudiovisualAuthorSpec>(inputs.spec?.value, "AudiovisualAuthorSpec"),
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
        )),
      }),
    },
  ],
} satisfies { refinements: RefinementPackage; producers: ProducerPackage };
