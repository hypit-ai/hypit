import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";
import { timelineTypes } from "./manifest.js";
import { assertTimelineIdentity } from "./identity.js";
import type { Timeline } from "./types.js";

function track(value: Value | undefined): Timeline {
  if (value === undefined) throw new Error("Timeline is missing.");
  return value as unknown as Timeline;
}

export const timelineComponent = {
  producers: [],
  refinements: [{
    type: timelineTypes.timeline,
    handler: ({ value }) => assertTimelineIdentity(track(value)),
  }],
} satisfies ProducerPackage & RefinementPackage;
