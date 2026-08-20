import type { ComponentPackage } from "@hypit/component-kit";
import type { CaptionCorrespondence, CaptionDisplaySequence } from "@hypit/narrative";
import type { SemanticTrack } from "@hypit/semantic-track";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { captionProducers, captionTypes } from "./manifest.js";
import { assertCaptionPlan } from "./plan.js";
import { assertCaptionProgram, assertCaptionStyle } from "./style.js";
import { temporalizeCaptionPlan } from "./temporalize.js";
import { assertTimedCaptionProjection } from "./temporalize.js";
import type {
  CaptionPlan,
  CaptionProgram,
  CaptionStyleIntent,
  TimedCaptionProjection,
} from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

/** Deterministic timing joins only; cue generation, Style meaning and visual lowering stay outside. */
export const captionComponent = {
  producers: [
    {
      producer: captionProducers.temporalizePlan,
      handler: ({ inputs }) => ({
        outputs: {
          caption: {
            kind: "inline",
            value: canonicalize(temporalizeCaptionPlan(
              inline<CaptionDisplaySequence>(inputs.display?.value, "CaptionDisplaySequence"),
              inline<CaptionCorrespondence>(inputs.correspondence?.value, "CaptionCorrespondence"),
              inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
              inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
              inline<CaptionPlan>(inputs.plan?.value, "CaptionPlan"),
            )),
          },
        },
        needs: {},
      }),
    },
  ],
  validators: [
    {
      type: captionTypes.style,
      handler: ({ value }) => assertCaptionStyle(inline<CaptionStyleIntent>(value, "CaptionStyle")),
    },
    {
      type: captionTypes.program,
      handler: ({ value }) => assertCaptionProgram(inline<CaptionProgram>(value, "CaptionProgram")),
    },
    {
      type: captionTypes.plan,
      handler: ({ value }) => assertCaptionPlan(inline(value, "CaptionPlan")),
    },
    {
      type: captionTypes.timedProjection,
      handler: ({ value }) => assertTimedCaptionProjection(
        inline<TimedCaptionProjection>(value, "TimedCaptionProjection"),
      ),
    },
  ],
} satisfies ComponentPackage;
