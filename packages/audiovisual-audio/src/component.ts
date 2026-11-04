import type { AudiovisualProgram } from "@hypit/audiovisual";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { PreparedMedia } from "@hypit/media";

import { lowerAudiovisualAudioProgram } from "./lower.js";
import { audiovisualAudioProducers, audiovisualAudioTypes } from "./manifest.js";
import { preparedMediaAudioSource } from "./prepared-media.js";
import {
  appendAudiovisualAudioSource,
  assertAudiovisualAudioOutput,
  assertAudiovisualAudioSourceSet,
  createAudiovisualAudioSourceSet,
  sealAudiovisualAudioSource,
} from "./source.js";
import type {
  AudiovisualAudioOutput,
  AudiovisualAudioSource,
  AudiovisualAudioSourceSet,
} from "./source.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audiovisualAudioComponent = {
  producers: [
    {
      producer: audiovisualAudioProducers.createSources,
      handler: () => ({ kind: "output", value: canonicalize(createAudiovisualAudioSourceSet()) }),
    },
    {
      producer: audiovisualAudioProducers.appendSource,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(appendAudiovisualAudioSource(
        valueOf<AudiovisualAudioSourceSet>(inputs.sources?.value, "AudiovisualAudioSourceSet"),
        valueOf<AudiovisualAudioSource>(inputs.source?.value, "AudiovisualAudioSource"),
      )) }),
    },
    {
      producer: audiovisualAudioProducers.preparedMediaSource,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(preparedMediaAudioSource(
        valueOf<PreparedMedia>(inputs.media?.value, "PreparedMedia"),
        valueOf<AudiovisualAudioOutput>(inputs.output?.value, "AudiovisualAudioOutput"),
      )) }),
    },
    {
      producer: audiovisualAudioProducers.programSource,
      handler: ({ inputs }) => {
        const program = valueOf<AudiovisualProgram>(inputs.program?.value, "AudiovisualProgram");
        return {
          kind: "output",
          value: canonicalize(sealAudiovisualAudioSource({
            source: program.id,
            output: "audio",
            program: lowerAudiovisualAudioProgram({
              program,
              sources: valueOf<AudiovisualAudioSourceSet>(
                inputs.sources?.value,
                "AudiovisualAudioSourceSet",
              ),
              sampling: valueOf<AudiovisualAudioOutput>(
                inputs.output?.value,
                "AudiovisualAudioOutput",
              ),
            }),
          })),
        };
      },
    },
    {
      producer: audiovisualAudioProducers.compile,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(lowerAudiovisualAudioProgram({
        program: valueOf<AudiovisualProgram>(inputs.program?.value, "AudiovisualProgram"),
        sources: valueOf<AudiovisualAudioSourceSet>(inputs.sources?.value, "AudiovisualAudioSourceSet"),
        sampling: valueOf<AudiovisualAudioOutput>(inputs.output?.value, "AudiovisualAudioOutput"),
      })) }),
    },
  ],
  refinements: [
    {
      type: audiovisualAudioTypes.source,
      handler: ({ value }) => { sealAudiovisualAudioSource(valueOf(value, "AudiovisualAudioSource")); },
    },
    {
      type: audiovisualAudioTypes.sourceSet,
      handler: ({ value }) => {
        assertAudiovisualAudioSourceSet(valueOf(value, "AudiovisualAudioSourceSet"));
      },
    },
    {
      type: audiovisualAudioTypes.output,
      handler: ({ value }) => { assertAudiovisualAudioOutput(valueOf(value, "AudiovisualAudioOutput")); },
    },
  ],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
