import type { CaptionProgram, TimedCaptionProjection } from "@narratage/caption";
import type { ComponentPackage } from "@narratage/component-kit";
import type { CaptionDisplaySequence } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { captionFineProducers } from "./manifest.js";
import { renderFineCaption } from "./render.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

export const captionFineComponent = {
  producers: [{
    producer: captionFineProducers.render,
    handler: ({ inputs }) => ({
      outputs: { track: { kind: "inline", value: canonicalize(renderFineCaption(
        inline<TimedCaptionProjection>(inputs.caption?.value, "TimedCaptionProjection"),
        inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
        inline<CaptionDisplaySequence>(inputs.display?.value, "CaptionDisplaySequence"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
      )) } },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
