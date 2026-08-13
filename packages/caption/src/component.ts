import type { ComponentPackage } from "@narratage/component-kit";
import type { CaptionCorrespondence, CaptionDisplaySequence } from "@narratage/narrative";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import {
  captionPlanImplementationDigest,
  captionProducers,
  captionTypes,
  captionValidatorDigests,
} from "./manifest.js";
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
      implementationDigest: captionPlanImplementationDigest,
      handler: ({ inputs }) => ({
        outputs: {
          caption: {
            kind: "inline",
            value: canonicalize(temporalizeCaptionPlan(
              inline<CaptionDisplaySequence>(inputs.display?.value, "CaptionDisplaySequence"),
              inline<CaptionCorrespondence>(inputs.correspondence?.value, "CaptionCorrespondence"),
              inline<CompleteSemanticMap>(inputs.map?.value, "CompleteSemanticMap"),
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
      implementationDigest: captionValidatorDigests.style,
      handler: ({ value }) => assertCaptionStyle(inline<CaptionStyleIntent>(value, "CaptionStyle")),
    },
    {
      type: captionTypes.program,
      implementationDigest: captionValidatorDigests.program,
      handler: ({ value }) => assertCaptionProgram(inline<CaptionProgram>(value, "CaptionProgram")),
    },
    {
      type: captionTypes.plan,
      implementationDigest: captionValidatorDigests.plan,
      handler: ({ value }) => assertCaptionPlan(inline(value, "CaptionPlan")),
    },
    {
      type: captionTypes.timedProjection,
      implementationDigest: captionValidatorDigests.timedProjection,
      handler: ({ value }) => assertTimedCaptionProjection(
        inline<TimedCaptionProjection>(value, "TimedCaptionProjection"),
      ),
    },
  ],
} satisfies ComponentPackage;
