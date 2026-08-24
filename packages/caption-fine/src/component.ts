import type { CaptionProgram, TimedCaptionProjection } from "@hypit/caption";
import type { ComponentPackage } from "@hypit/component-kit";
import type { CaptionDocument } from "@hypit/narrative";
import { projectSemanticProgramSpace } from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { captionFineProducers } from "./manifest.js";
import { renderFineCaption } from "./render.js";
import { scheduleFineCaption } from "./schedule.js";
import type { FineCaptionSchedule } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

export const captionFineComponent = {
  producers: [
    {
      producer: captionFineProducers.schedule,
      handler: ({ inputs }) => ({
        outputs: { schedule: { kind: "inline", value: canonicalize(scheduleFineCaption(
          inline<TimedCaptionProjection>(inputs.caption?.value, "TimedCaptionProjection"),
          inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
          inline<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
        )) } },
        needs: {},
      }),
    },
    {
      producer: captionFineProducers.render,
      handler: ({ inputs }) => ({
        outputs: { track: { kind: "inline", value: canonicalize(renderFineCaption(
          inline<FineCaptionSchedule>(inputs.schedule?.value, "FineCaptionSchedule"),
          inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
          inline<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
          projectSemanticProgramSpace(inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack")),
        )) } },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
