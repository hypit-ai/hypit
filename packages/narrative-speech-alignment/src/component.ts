import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { AlignedTranscriptEvidence } from "@hypit/speech-evidence";
import type { LocalTemporalDomain } from "@hypit/temporal";

import { alignNarrative } from "./local.js";
import { speechAlignmentProducers } from "./manifest.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as T;
}

export const speechAlignmentComponent = {
  producers: [{
    producer: speechAlignmentProducers.alignNarrative,
    handler: ({ inputs }) => {
      const result = alignNarrative(
        valueOf<Narrative>(inputs.narrative?.value, "Narrative"),
        valueOf<NarrativeSegmentRef>(inputs.segment?.value, "NarrativeSegmentRef"),
        valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain"),
        valueOf<AlignedTranscriptEvidence>(inputs.evidence?.value, "AlignedTranscriptEvidence"),
      );
      return { kind: "output", value: (canonicalize(result)) };
    },
  }],
} satisfies ProducerPackage & RefinementPackage;
