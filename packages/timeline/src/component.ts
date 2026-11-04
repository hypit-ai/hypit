import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { ProducerPackage } from "@hypit/hypit/producer";
import { canonicalize, type Value } from "@hypit/hypit/protocol";
import { timelineProducers, timelineTypes } from "./manifest.js";
import { assertClockIdentity, assertFrameSpan, assertTimelineIdentity } from "./identity.js";
import { assertTemporalIdentitySpec, assertTemporalInstant, assertTemporalWindow, composeTemporalWindow } from "./temporal.js";
import type { Clock, FrameSpan, TemporalIdentitySpec, TemporalInstant, TemporalWindow, Timeline } from "./types.js";

function timeline(value: Value | undefined): Timeline {
  if (value === undefined) throw new Error("Timeline is missing.");
  return value as unknown as Timeline;
}

export const timelineComponent = {
  producers: [{ producer: timelineProducers.composeWindow, handler: ({ inputs }) => {
    const spec = inputs.spec?.value as unknown as TemporalIdentitySpec;
    const start = inputs.start?.value as unknown as TemporalInstant;
    const end = inputs.end?.value as unknown as TemporalInstant;
    assertTemporalIdentitySpec(spec);
    return { kind: "output", value: canonicalize(composeTemporalWindow(spec, start, end)) };
  } }],
  refinements: [{
    type: timelineTypes.timeline,
    handler: ({ value }) => assertTimelineIdentity(timeline(value)),
  }, {
    type: timelineTypes.clock,
    handler: ({ value }) => assertClockIdentity(value as unknown as Clock),
  }, {
    type: timelineTypes.frameSpan,
    handler: ({ value }) => assertFrameSpan(value as unknown as FrameSpan),
  }, {
    type: timelineTypes.instant,
    handler: ({ value }) => assertTemporalInstant(value as unknown as TemporalInstant),
  }, {
    type: timelineTypes.window,
    handler: ({ value }) => assertTemporalWindow(value as unknown as TemporalWindow),
  }, {
    type: timelineTypes.temporalIdentity,
    handler: ({ value }) => assertTemporalIdentitySpec(value),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
