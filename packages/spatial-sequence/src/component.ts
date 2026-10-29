import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { canonicalize, type Value } from "@hypit/hypit/protocol";
import type { Canvas } from "@hypit/spatial";
import type { Timeline } from "@hypit/timeline";

import { spatialSequenceProducers, spatialSequenceTypes } from "./manifest.js";
import {
  assertRegionSequenceDocument,
  assertTimelineRegionSequence,
  resolveTimelineRegionSequence,
} from "./sequence.js";
import type { RegionSequenceDocument, TimelineRegionSequence } from "./types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const spatialSequenceComponent = {
  producers: [{
    producer: spatialSequenceProducers.resolveTimelineRegions,
    handler: ({ inputs }) => ({
      kind: "output",
      value: canonicalize(resolveTimelineRegionSequence(
        valueOf<RegionSequenceDocument>(inputs.document?.value, "RegionSequenceDocument"),
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        valueOf<Canvas>(inputs.canvas?.value, "Canvas"),
      )),
    }),
  }],
  refinements: [
    { type: spatialSequenceTypes.document, handler: ({ value }) => assertRegionSequenceDocument(valueOf<RegionSequenceDocument>(value, "RegionSequenceDocument")) },
    { type: spatialSequenceTypes.timelineRegions, handler: ({ value }) => assertTimelineRegionSequence(valueOf<TimelineRegionSequence>(value, "TimelineRegionSequence")) },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
