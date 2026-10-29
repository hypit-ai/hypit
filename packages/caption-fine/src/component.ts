import type { Timeline } from "@hypit/timeline";
import type { CaptionDocument, CaptionProgram, CaptionTiming } from "@hypit/caption";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { TimelineRegionSequence } from "@hypit/spatial-sequence";
import type { SpatialFrame } from "@hypit/spatial";

import { captionFineProducers, captionFineTypes } from "./manifest.js";
import { renderFineCaption } from "./render.js";
import { scheduleFineCaption } from "./schedule.js";
import { assertFineCaptionRegionBindings } from "./region-binding.js";
import type { FineCaptionRegionBindings, FineCaptionSchedule } from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as T;
}

export const captionFineComponent = {
  producers: [
    {
      producer: captionFineProducers.schedule,
      handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(scheduleFineCaption(
          valueOf<CaptionTiming>(inputs.timing?.value, "CaptionTiming"),
          valueOf<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
          valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
        ))) }),
    },
    {
      producer: captionFineProducers.render,
      handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(renderFineCaption(
          valueOf<FineCaptionSchedule>(inputs.schedule?.value, "FineCaptionSchedule"),
          valueOf<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
          valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
          valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
          valueOf<SpatialFrame>(inputs.within?.value, "SpatialFrame"),
        ))) }),
    },
    {
      producer: captionFineProducers.renderWithRegions,
      handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(renderFineCaption(
          valueOf<FineCaptionSchedule>(inputs.schedule?.value, "FineCaptionSchedule"),
          valueOf<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
          valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
          valueOf<Timeline>(inputs.timeline?.value, "Timeline"),
          valueOf<SpatialFrame>(inputs.within?.value, "SpatialFrame"),
          valueOf<TimelineRegionSequence>(inputs.regions?.value, "TimelineRegionSequence"),
          valueOf<FineCaptionRegionBindings>(inputs.regionBindings?.value, "FineCaptionRegionBindings"),
        ))) }),
    },
  ],
  refinements: [{
    type: captionFineTypes.regionBindings,
    handler: ({ value }) => assertFineCaptionRegionBindings(valueOf<FineCaptionRegionBindings>(value, "FineCaptionRegionBindings")),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
