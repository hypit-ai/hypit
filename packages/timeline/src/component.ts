import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";
import { timelineTypes } from "./manifest.js";
import { assertFrameSpan, assertTimelineIdentity } from "./identity.js";
import type { FrameSpan, Timeline } from "./types.js";

function timeline(value: Value | undefined): Timeline {
  if (value === undefined) throw new Error("Timeline is missing.");
  return value as unknown as Timeline;
}

export const timelineComponent = {
  producers: [],
  refinements: [{
    type: timelineTypes.timeline,
    handler: ({ value }) => assertTimelineIdentity(timeline(value)),
  }, {
    type: timelineTypes.frameSpan,
    handler: ({ value }) => assertFrameSpan(value as unknown as FrameSpan),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
