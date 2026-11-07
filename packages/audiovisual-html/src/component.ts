import type { AudiovisualProgram } from "@hypit/audiovisual";
import { canonicalize } from "@hypit/protocol";
import type { Value } from "@hypit/protocol";
import type { ProducerPackage } from "@hypit/producer";
import type { RefinementPackage } from "@hypit/refinement";
import type { PreparedMedia } from "@hypit/media";

import { compileAudiovisualHtmlProgram } from "./compile.js";
import { audiovisualHtmlProducers, audiovisualHtmlTypes } from "./manifest.js";
import {
  appendAudiovisualHtmlSource,
  assertAudiovisualHtmlOutput,
  assertAudiovisualHtmlSourceSet,
  audiovisualProgramHtmlSource,
  createAudiovisualHtmlSourceSet,
  preparedMediaHtmlSource,
  sealAudiovisualHtmlSource,
} from "./source.js";
import type {
  AudiovisualHtmlOutput,
  AudiovisualHtmlSource,
  AudiovisualHtmlSourceSet,
} from "./source.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audiovisualHtmlComponent = {
  producers: [
    {
      producer: audiovisualHtmlProducers.createSources,
      handler: () => ({ kind: "output", value: canonicalize(createAudiovisualHtmlSourceSet()) }),
    },
    {
      producer: audiovisualHtmlProducers.appendSource,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(appendAudiovisualHtmlSource(
        valueOf<AudiovisualHtmlSourceSet>(inputs.sources?.value, "AudiovisualHtmlSourceSet"),
        valueOf<AudiovisualHtmlSource>(inputs.source?.value, "AudiovisualHtmlSource"),
      )) }),
    },
    {
      producer: audiovisualHtmlProducers.preparedMediaSource,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(preparedMediaHtmlSource(
        valueOf<PreparedMedia>(inputs.media?.value, "PreparedMedia"),
      )) }),
    },
    {
      producer: audiovisualHtmlProducers.programSource,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(audiovisualProgramHtmlSource(
        valueOf<AudiovisualProgram>(inputs.program?.value, "AudiovisualProgram"),
        valueOf<AudiovisualHtmlSourceSet>(inputs.sources?.value, "AudiovisualHtmlSourceSet"),
      )) }),
    },
    {
      producer: audiovisualHtmlProducers.compile,
      handler: ({ inputs }) => ({ kind: "output", value: canonicalize(compileAudiovisualHtmlProgram(
        valueOf<AudiovisualProgram>(inputs.program?.value, "AudiovisualProgram"),
        valueOf<AudiovisualHtmlSourceSet>(inputs.sources?.value, "AudiovisualHtmlSourceSet"),
        valueOf<AudiovisualHtmlOutput>(inputs.output?.value, "AudiovisualHtmlOutput"),
      )) }),
    },
  ],
  refinements: [
    {
      type: audiovisualHtmlTypes.source,
      handler: ({ value }) => { sealAudiovisualHtmlSource(valueOf(value, "AudiovisualHtmlSource")); },
    },
    {
      type: audiovisualHtmlTypes.sourceSet,
      handler: ({ value }) => { assertAudiovisualHtmlSourceSet(valueOf(value, "AudiovisualHtmlSourceSet")); },
    },
    {
      type: audiovisualHtmlTypes.output,
      handler: ({ value }) => { assertAudiovisualHtmlOutput(valueOf(value, "AudiovisualHtmlOutput")); },
    },
  ],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
