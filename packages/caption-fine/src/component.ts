import type { Timeline } from "@hypit/timeline";
import type { CaptionDocument, CaptionProgram, CaptionTiming } from "@hypit/caption";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { RegionEvidence } from "@hypit/region-evidence";
import type { SpatialFrame } from "@hypit/spatial";

import { captionFineProducers } from "./manifest.js";
import { renderFineCaption } from "./render.js";
import { scheduleFineCaption } from "./schedule.js";
import type { FineCaptionSchedule } from "./types.js";

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
          valueOf<RegionEvidence>(inputs.regions?.value, "RegionEvidence"),
        ))) }),
    },
  ],
} satisfies ProducerPackage & RefinementPackage;
