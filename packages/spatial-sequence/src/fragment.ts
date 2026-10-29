import { sealGraphFragment } from "@hypit/hypit/author";
import { spatialTypes } from "@hypit/spatial";
import { timelineTypes } from "@hypit/timeline";

import { spatialSequenceProducers, spatialSequenceTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });

export const timelineRegionSequenceFragment = sealGraphFragment({
  inputs: [
    { name: "document", type: spatialSequenceTypes.document },
    { name: "timeline", type: timelineTypes.timeline },
    { name: "canvas", type: spatialTypes.canvas },
  ],
  operations: [{
    id: "resolve",
    producer: spatialSequenceProducers.resolveTimelineRegions,
    inputs: { document: input("document"), timeline: input("timeline"), canvas: input("canvas") },
    result: { kind: "output" as const, name: "regions" },
  }],
  exports: [{
    name: "regions",
    type: spatialSequenceTypes.timelineRegions,
    root: { kind: "fragment-operation", operation: "resolve" },
  }],
});
