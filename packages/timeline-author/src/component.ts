import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import { assertTemporalDuration, temporalExtentFromDuration } from "@hypit/temporal";
import type { TemporalDuration, TemporalExtent } from "@hypit/temporal";
import { assertTemporalInstant } from "@hypit/timeline";
import type { Clock, FrameSpan, TemporalInstant, Timeline } from "@hypit/timeline";

import { timelineAuthorProducers, timelineAuthorTypes } from "./manifest.js";
import { projectTimelineInstant, shiftTimelineInstant } from "./legacy-projection.js";
import { assertTimelineInstantSpec, assertTimelineShiftSpec } from "./legacy-validation.js";
import {
  constructionAliasPoint, constructionDuration, constructionEarliest, constructionLatest, constructionOffset,
  constructionOrigin, constructionResolvedExtent, constructionSpan, constructionSpanBetween,
  constructionSpanEnd, constructionSpanEnding, constructionSpanStart,
  finalizeTimeline, materializeInstant, materializeWindow,
} from "./program.js";
import type {
  ConstructionDurationSpec, ConstructionExtent, ConstructionIdentitySpec, ConstructionOffsetSpec, ConstructionResolutionSpec,
  ConstructionPoint, TimelineAuthorHeader, TimelineInstantSpec, TimelineShiftSpec,
} from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value as unknown as T;
}
const output = (value: unknown) => ((canonicalize(value)));

export const timelineAuthorComponent = {
  refinements: [
    { type: timelineAuthorTypes.instantSpec, handler: ({ value }) => assertTimelineInstantSpec(value) },
    { type: timelineAuthorTypes.shiftSpec, handler: ({ value }) => assertTimelineShiftSpec(value) },
  ],
  producers: [
    { producer: timelineAuthorProducers.origin, handler: ({ inputs }) => ({ kind: "output", value: output(constructionOrigin(valueOf<Clock>(inputs.clock?.value, "Clock"))) }) },
    { producer: timelineAuthorProducers.duration, handler: ({ inputs }) => ({ kind: "output", value: output(constructionDuration(valueOf<Clock>(inputs.clock?.value, "Clock"), valueOf<ConstructionDurationSpec>(inputs.duration?.value, "ConstructionDurationSpec").duration)) }) },
    { producer: timelineAuthorProducers.resolvedExtent, handler: ({ inputs }) => ({ kind: "output", value: output(constructionResolvedExtent(
      valueOf<Clock>(inputs.clock?.value, "Clock"),
      valueOf<TemporalExtent>(inputs.extent?.value, "TemporalExtent"),
      valueOf<ConstructionResolutionSpec>(inputs.resolution?.value, "ConstructionResolutionSpec").policy,
    )) }) },
    { producer: timelineAuthorProducers.offset, handler: ({ inputs }) => ({ kind: "output", value: output(constructionOffset(valueOf<ConstructionPoint>(inputs.point?.value, "ConstructionPoint"), valueOf<ConstructionExtent>(inputs.extent?.value, "ConstructionExtent"), valueOf<ConstructionOffsetSpec>(inputs.spec?.value, "ConstructionOffsetSpec"))) }) },
    { producer: timelineAuthorProducers.earliest, handler: ({ inputs }) => ({ kind: "output", value: output(constructionEarliest(valueOf<ConstructionPoint>(inputs.left?.value, "ConstructionPoint"), valueOf<ConstructionPoint>(inputs.right?.value, "ConstructionPoint"))) }) },
    { producer: timelineAuthorProducers.latest, handler: ({ inputs }) => ({ kind: "output", value: output(constructionLatest(valueOf<ConstructionPoint>(inputs.left?.value, "ConstructionPoint"), valueOf<ConstructionPoint>(inputs.right?.value, "ConstructionPoint"))) }) },
    { producer: timelineAuthorProducers.aliasPoint, handler: ({ inputs }) => ({ kind: "output", value: output(constructionAliasPoint(valueOf<ConstructionPoint>(inputs.point?.value, "ConstructionPoint"))) }) },
    { producer: timelineAuthorProducers.span, handler: ({ inputs }) => ({ kind: "output", value: output(constructionSpan(valueOf<ConstructionPoint>(inputs.start?.value, "ConstructionPoint"), valueOf<ConstructionExtent>(inputs.extent?.value, "ConstructionExtent"))) }) },
    { producer: timelineAuthorProducers.spanEnding, handler: ({ inputs }) => ({ kind: "output", value: output(constructionSpanEnding(valueOf<ConstructionPoint>(inputs.end?.value, "ConstructionPoint"), valueOf<ConstructionExtent>(inputs.extent?.value, "ConstructionExtent"))) }) },
    { producer: timelineAuthorProducers.spanBetween, handler: ({ inputs }) => ({ kind: "output", value: output(constructionSpanBetween(valueOf<ConstructionPoint>(inputs.start?.value, "ConstructionPoint"), valueOf<ConstructionPoint>(inputs.end?.value, "ConstructionPoint"))) }) },
    { producer: timelineAuthorProducers.spanStart, handler: ({ inputs }) => ({ kind: "output", value: output(constructionSpanStart(valueOf<FrameSpan>(inputs.span?.value, "FrameSpan"))) }) },
    { producer: timelineAuthorProducers.spanEnd, handler: ({ inputs }) => ({ kind: "output", value: output(constructionSpanEnd(valueOf<FrameSpan>(inputs.span?.value, "FrameSpan"))) }) },
    { producer: timelineAuthorProducers.finalize, handler: ({ inputs }) => ({ kind: "output", value: output(finalizeTimeline(valueOf<TimelineAuthorHeader>(inputs.header?.value, "TimelineAuthorHeader"), valueOf<Clock>(inputs.clock?.value, "Clock"), valueOf<ConstructionPoint>(inputs.end?.value, "ConstructionPoint"))) }) },
    { producer: timelineAuthorProducers.instant, handler: ({ inputs }) => ({ kind: "output", value: output(materializeInstant(valueOf<Timeline>(inputs.timeline?.value, "Timeline"), valueOf<ConstructionPoint>(inputs.point?.value, "ConstructionPoint"), valueOf<ConstructionIdentitySpec>(inputs.spec?.value, "ConstructionIdentitySpec"))) }) },
    { producer: timelineAuthorProducers.window, handler: ({ inputs }) => ({ kind: "output", value: output(materializeWindow(valueOf<Timeline>(inputs.timeline?.value, "Timeline"), valueOf<FrameSpan>(inputs.span?.value, "FrameSpan"), valueOf<ConstructionIdentitySpec>(inputs.spec?.value, "ConstructionIdentitySpec"))) }) },
    { producer: timelineAuthorProducers.extentFromDuration, handler: ({ inputs }) => {
      const duration = valueOf<TemporalDuration>(inputs.duration?.value, "TemporalDuration");
      assertTemporalDuration(duration);
      return { kind: "output", value: output(temporalExtentFromDuration(
        duration, valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
      )) };
    } },
    { producer: timelineAuthorProducers.projectInstant, handler: ({ inputs }) => {
      const spec = valueOf<TimelineInstantSpec>(inputs.spec?.value, "TimelineInstantSpec");
      assertTimelineInstantSpec(spec);
      return { kind: "output", value: output(projectTimelineInstant({
        itemId: spec.id,
        subjectId: spec.subjectId,
        timeline: valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        projection: spec.projection,
      })) };
    } },
    { producer: timelineAuthorProducers.shiftInstant, handler: ({ inputs }) => {
      const spec = valueOf<TimelineShiftSpec>(inputs.spec?.value, "TimelineShiftSpec");
      const instant = valueOf<TemporalInstant>(inputs.instant?.value, "TemporalInstant");
      assertTimelineShiftSpec(spec);
      assertTemporalInstant(instant);
      return { kind: "output", value: output(shiftTimelineInstant(
        spec,
        valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
        instant,
        valueOf<TemporalExtent>(inputs.extent?.value, "TemporalExtent"),
      )) };
    } },
    { producer: timelineAuthorProducers.reuseInstant, handler: ({ inputs }) => {
      const instant = valueOf<TemporalInstant>(inputs.instant?.value, "TemporalInstant");
      assertTemporalInstant(instant);
      return { kind: "output", value: output(instant) };
    } },
  ],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
