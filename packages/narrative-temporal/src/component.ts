import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { LocalTemporalDomain } from "@hypit/temporal";

import {
  assertNarrativeAlignmentIdentity,
  assertNarrativeLocalTimingIdentity,
  assertNarrativeTimingHeaderIdentity,
  assertNarrativeTimingPartsIdentity,
} from "./identity.js";
import { materializeSegmentBoundaryAlignment } from "./materialize.js";
import { narrativeTemporalProducers, narrativeTemporalTypes } from "./manifest.js";
import { createNarrativeLocalTiming } from "./timing.js";
import type {
  NarrativeAlignment,
  NarrativeLocalTiming,
  NarrativeTimingHeader,
  NarrativeTimingParts,
} from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as T;
}

export const narrativeTemporalComponent = {
  refinements: [{
    type: narrativeTemporalTypes.narrativeAlignment,
    handler: ({ value }) => assertNarrativeAlignmentIdentity(valueOf<NarrativeAlignment>(value, "NarrativeAlignment")),
  }, {
    type: narrativeTemporalTypes.narrativeLocalTiming,
    handler: ({ value }) => assertNarrativeLocalTimingIdentity(valueOf<NarrativeLocalTiming>(value, "NarrativeLocalTiming")),
  }, {
    type: narrativeTemporalTypes.narrativeTimingParts,
    handler: ({ value }) => assertNarrativeTimingPartsIdentity(valueOf<NarrativeTimingParts>(value, "NarrativeTimingParts")),
  }, {
    type: narrativeTemporalTypes.narrativeTimingHeader,
    handler: ({ value }) => assertNarrativeTimingHeaderIdentity(valueOf<NarrativeTimingHeader>(value, "NarrativeTimingHeader")),
  }],
  producers: [{
    producer: narrativeTemporalProducers.materializeSegmentBoundaries,
    handler: ({ inputs }) => ({ kind: "output", value: canonicalize(materializeSegmentBoundaryAlignment(
      valueOf<Narrative>(inputs.narrative?.value, "Narrative"),
      valueOf<NarrativeSegmentRef>(inputs.segment?.value, "NarrativeSegmentRef"),
      valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain"),
    )) }),
  }, {
    producer: narrativeTemporalProducers.collectAlignment,
    handler: ({ inputs }) => {
      const alignment = valueOf<NarrativeAlignment>(inputs.alignment?.value, "NarrativeAlignment");
      const domain = valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain");
      assertNarrativeAlignmentIdentity(alignment, domain);
      return { kind: "output", value: canonicalize({ alignments: [alignment] }) };
    },
  }, {
    producer: narrativeTemporalProducers.combineTimingParts,
    handler: ({ inputs }) => {
      const left = valueOf<NarrativeTimingParts>(inputs.left?.value, "NarrativeTimingParts");
      const right = valueOf<NarrativeTimingParts>(inputs.right?.value, "NarrativeTimingParts");
      assertNarrativeTimingPartsIdentity(left);
      assertNarrativeTimingPartsIdentity(right);
      return { kind: "output", value: canonicalize({ alignments: [...left.alignments, ...right.alignments] }) };
    },
  }, {
    producer: narrativeTemporalProducers.finalizeTiming,
    handler: ({ inputs }) => {
      const header = valueOf<NarrativeTimingHeader>(inputs.header?.value, "NarrativeTimingHeader");
      const narrative = valueOf<Narrative>(inputs.narrative?.value, "Narrative");
      const domain = valueOf<LocalTemporalDomain>(inputs.domain?.value, "LocalTemporalDomain");
      const parts = valueOf<NarrativeTimingParts>(inputs.parts?.value, "NarrativeTimingParts");
      assertNarrativeTimingHeaderIdentity(header);
      assertNarrativeTimingPartsIdentity(parts);
      return { kind: "output", value: canonicalize(
        createNarrativeLocalTiming(header.id, narrative.id, domain, parts.alignments),
      ) };
    },
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
