import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type {
  AudioOperator,
  Occurrence,
  PictureOperator,
  ProgramSource,
  SignalReconstruction,
} from "@hypit/audiovisual";
import { assertOccurrence } from "@hypit/audiovisual";
import {
  assertLocalSpatialDomain,
  assertSpatialMap,
  type LocalSpatialDomain,
  type SpatialMap,
} from "@hypit/spatial/algebra";
import {
  assertExactTemporalValue,
  assertTemporalMap,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type TemporalMap,
} from "@hypit/temporal/algebra";

import {
  appendAudiovisualAuthorAudioOperator,
  appendAudiovisualAuthorPictureOperator,
  appendAudiovisualAuthorReconstruction,
  appendAudiovisualAuthorValue,
  assertAudiovisualAuthorBindingSet,
  assertAudiovisualAuthorOperatorBinding,
  assertAudiovisualAuthorReconstructionBinding,
  assertAudiovisualAuthorValueBinding,
  createAudiovisualAuthorBindingSet,
} from "./bindings.js";
import {
  assertAudiovisualAuthorOccurrenceSet,
  assertAudiovisualAuthorOccurrenceUse,
  audiovisualAuthorOccurrenceUseEnd,
  closeAudiovisualAuthorOccurrence,
  closeResolvedAudiovisualAuthorProgram,
  createAudiovisualAuthorProgramDomain,
  bindAudiovisualAuthorOccurrenceUseToOccurrence,
  bindAudiovisualAuthorOccurrenceUseToSource,
  inferAudiovisualAuthorOccurrenceDuration,
  projectAudiovisualAuthorOccurrenceUsePosition,
  projectAudiovisualAuthorOccurrenceUseOutputMapping,
  resolveAudiovisualAuthorOccurrenceUse,
} from "./compile.js";
import { audiovisualAuthorProducers, audiovisualAuthorTypes } from "./manifest.js";
import type {
  AudiovisualAuthorBindingSet,
  AudiovisualAuthorOccurrenceBoundSpec,
  AudiovisualAuthorOccurrenceOutputSpec,
  AudiovisualAuthorOccurrenceSet,
  AudiovisualAuthorOccurrenceUse,
  AudiovisualAuthorOccurrenceUseSpec,
  AudiovisualAuthorOperatorBinding,
  AudiovisualAuthorProgramDomainSpec,
  AudiovisualAuthorReconstructionBinding,
  AudiovisualAuthorValueBinding,
  AudiovisualAuthorSpec,
  AudiovisualAuthorSourceBoundSpec,
} from "./types.js";
import {
  assertAudiovisualAuthorOccurrenceBoundSpec,
  assertAudiovisualAuthorOccurrenceOutputSpec,
  assertAudiovisualAuthorOccurrenceUseSpec,
  assertAudiovisualAuthorProgramDomainSpec,
  assertAudiovisualAuthorSpec,
  assertAudiovisualAuthorSourceBoundSpec,
} from "./validation.js";

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
      type: audiovisualAuthorTypes.valueBinding,
      handler: ({ value }) => assertAudiovisualAuthorValueBinding(
        valueOf<AudiovisualAuthorValueBinding>(value, "AudiovisualAuthorValueBinding"),
      ),
    },
    {
      type: audiovisualAuthorTypes.bindingSet,
      handler: ({ value }) => assertAudiovisualAuthorBindingSet(
        valueOf<AudiovisualAuthorBindingSet>(value, "AudiovisualAuthorBindingSet"),
      ),
    },
    {
      type: audiovisualAuthorTypes.occurrenceUseSpec,
      handler: ({ value }) => assertAudiovisualAuthorOccurrenceUseSpec(
        valueOf<AudiovisualAuthorOccurrenceUseSpec>(value, "AudiovisualAuthorOccurrenceUseSpec"),
      ),
    },
    {
      type: audiovisualAuthorTypes.occurrenceUse,
      handler: ({ value }) => assertAudiovisualAuthorOccurrenceUse(
        valueOf<AudiovisualAuthorOccurrenceUse>(value, "AudiovisualAuthorOccurrenceUse"),
      ),
    },
    {
      type: audiovisualAuthorTypes.sourceBoundSpec,
      handler: ({ value }) => assertAudiovisualAuthorSourceBoundSpec(
        valueOf<AudiovisualAuthorSourceBoundSpec>(value, "AudiovisualAuthorSourceBoundSpec"),
      ),
    },
    {
      type: audiovisualAuthorTypes.occurrenceBoundSpec,
      handler: ({ value }) => assertAudiovisualAuthorOccurrenceBoundSpec(
        valueOf<AudiovisualAuthorOccurrenceBoundSpec>(value, "AudiovisualAuthorOccurrenceBoundSpec"),
      ),
    },
    {
      type: audiovisualAuthorTypes.occurrenceOutputSpec,
      handler: ({ value }) => assertAudiovisualAuthorOccurrenceOutputSpec(
        valueOf<AudiovisualAuthorOccurrenceOutputSpec>(value, "AudiovisualAuthorOccurrenceOutputSpec"),
      ),
    },
    {
      type: audiovisualAuthorTypes.programDomainSpec,
      handler: ({ value }) => assertAudiovisualAuthorProgramDomainSpec(
        valueOf<AudiovisualAuthorProgramDomainSpec>(value, "AudiovisualAuthorProgramDomainSpec"),
      ),
    },
    {
      type: audiovisualAuthorTypes.occurrence,
      handler: ({ value }) => assertOccurrence(valueOf<Occurrence>(
        value, "AudiovisualAuthorResolvedOccurrence",
      )),
    },
    {
      type: audiovisualAuthorTypes.occurrenceSet,
      handler: ({ value }) => assertAudiovisualAuthorOccurrenceSet(
        valueOf<AudiovisualAuthorOccurrenceSet>(value, "AudiovisualAuthorOccurrenceSet"),
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
      producer: audiovisualAuthorProducers.appendSpatialDomain,
      handler: ({ inputs }) => {
        const value = valueOf<LocalSpatialDomain>(inputs.value?.value, "LocalSpatialDomain");
        assertLocalSpatialDomain(value);
        return { kind: "output", value: canonicalize(appendAudiovisualAuthorValue(
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<AudiovisualAuthorValueBinding>(inputs.binding?.value, "AudiovisualAuthorValueBinding"),
          canonicalize(value),
        )) };
      },
    },
    {
      producer: audiovisualAuthorProducers.appendSpatialMap,
      handler: ({ inputs }) => {
        const value = valueOf<SpatialMap>(inputs.value?.value, "SpatialMap");
        assertSpatialMap(value);
        return { kind: "output", value: canonicalize(appendAudiovisualAuthorValue(
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<AudiovisualAuthorValueBinding>(inputs.binding?.value, "AudiovisualAuthorValueBinding"),
          canonicalize(value),
        )) };
      },
    },
    {
      producer: audiovisualAuthorProducers.appendTemporalMap,
      handler: ({ inputs }) => {
        const value = valueOf<TemporalMap>(inputs.value?.value, "TemporalMap");
        assertTemporalMap(value);
        return { kind: "output", value: canonicalize(appendAudiovisualAuthorValue(
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<AudiovisualAuthorValueBinding>(inputs.binding?.value, "AudiovisualAuthorValueBinding"),
          canonicalize(value),
        )) };
      },
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
      producer: audiovisualAuthorProducers.inferOccurrenceDuration,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        inferAudiovisualAuthorOccurrenceDuration(
          valueOf<AudiovisualAuthorOccurrenceUseSpec>(inputs.spec?.value, "OccurrenceUseSpec"),
          valueOf<ProgramSource>(inputs.source?.value, "ProgramSource"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.resolveOccurrenceUse,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        resolveAudiovisualAuthorOccurrenceUse(
          valueOf<AudiovisualAuthorOccurrenceUseSpec>(inputs.spec?.value, "OccurrenceUseSpec"),
          valueOf<ProgramSource>(inputs.source?.value, "ProgramSource"),
          valueOf<ExactTemporalValue>(inputs.start?.value, "Occurrence start"),
          valueOf<ExactTemporalValue>(inputs.duration?.value, "Occurrence duration"),
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.bindOccurrenceUseToSource,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        bindAudiovisualAuthorOccurrenceUseToSource(
          valueOf<AudiovisualAuthorSourceBoundSpec>(inputs.spec?.value, "SourceBoundSpec"),
          valueOf<AudiovisualAuthorOccurrenceUse>(inputs.target?.value, "Target OccurrenceUse"),
          valueOf<ProgramSource>(inputs.source?.value, "ProgramSource"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.bindOccurrenceUseToOccurrence,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        bindAudiovisualAuthorOccurrenceUseToOccurrence(
          valueOf<AudiovisualAuthorOccurrenceBoundSpec>(inputs.spec?.value, "OccurrenceBoundSpec"),
          valueOf<AudiovisualAuthorOccurrenceUse>(inputs.target?.value, "Target OccurrenceUse"),
          valueOf<ProgramSource>(inputs.source?.value, "ProgramSource"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.projectOccurrenceUseOutputMapping,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        projectAudiovisualAuthorOccurrenceUseOutputMapping(
          valueOf<AudiovisualAuthorOccurrenceOutputSpec>(inputs.spec?.value, "OccurrenceOutputSpec"),
          valueOf<AudiovisualAuthorOccurrenceUse>(inputs.use?.value, "OccurrenceUse"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.projectOccurrenceUseEnd,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        audiovisualAuthorOccurrenceUseEnd(
          valueOf<AudiovisualAuthorOccurrenceUse>(inputs.use?.value, "OccurrenceUse"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.projectOccurrenceUsePosition,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        projectAudiovisualAuthorOccurrenceUsePosition(
          valueOf<AudiovisualAuthorOccurrenceUse>(inputs.use?.value, "OccurrenceUse"),
          valueOf<ExactTemporalValue>(inputs.local?.value, "Occurrence local position"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.createProgramDomain,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        createAudiovisualAuthorProgramDomain(
          valueOf<AudiovisualAuthorProgramDomainSpec>(inputs.spec?.value, "ProgramDomainSpec"),
          valueOf<ExactTemporalValue>(inputs.duration?.value, "Programme duration"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.closeOccurrence,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        closeAudiovisualAuthorOccurrence(
          valueOf<AudiovisualAuthorOccurrenceUse>(inputs.use?.value, "OccurrenceUse"),
          valueOf<LocalTemporalDomain>(inputs.parent?.value, "Programme Domain"),
        ),
      ) }),
    },
    {
      producer: audiovisualAuthorProducers.createOccurrences,
      handler: () => ({ kind: "output", value: canonicalize({}) }),
    },
    {
      producer: audiovisualAuthorProducers.appendOccurrence,
      handler: ({ inputs }) => {
        const occurrences = valueOf<AudiovisualAuthorOccurrenceSet>(inputs.occurrences?.value,
          "AudiovisualAuthorOccurrenceSet");
        const occurrence = valueOf<Occurrence>(inputs.occurrence?.value, "Occurrence");
        assertOccurrence(occurrence);
        if (Object.hasOwn(occurrences, occurrence.id)) {
          throw new Error(`Audiovisual Author Occurrence Set repeats ${occurrence.id}.`);
        }
        return { kind: "output", value: canonicalize({ ...occurrences, [occurrence.id]: occurrence }) };
      },
    },
    {
      producer: audiovisualAuthorProducers.closeResolvedProgram,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(
        closeResolvedAudiovisualAuthorProgram(
          valueOf<AudiovisualAuthorSpec>(inputs.spec?.value, "AudiovisualAuthorSpec"),
          valueOf<AudiovisualAuthorBindingSet>(inputs.bindings?.value, "AudiovisualAuthorBindingSet"),
          valueOf<LocalTemporalDomain>(inputs.domain?.value, "Programme Domain"),
          valueOf<AudiovisualAuthorOccurrenceSet>(inputs.occurrences?.value,
            "AudiovisualAuthorOccurrenceSet"),
        ),
      ) }),
    },
  ],
} satisfies { refinements: RefinementPackage; producers: ProducerPackage };
