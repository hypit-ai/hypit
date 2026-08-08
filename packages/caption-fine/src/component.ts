import type { CaptionProgram, TimedCaptionProjection } from "@narratage/caption";
import type { ComponentPackage } from "@narratage/component-kit";
import type { CaptionWordSequence } from "@narratage/narrative";
import type { ProgramSpace } from "@narratage/program-space";
import type { StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

import { captionFineProducers } from "./manifest.js";
import { renderFineCaption, renderFineCaptionImplementationDigest } from "./render.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

export const captionFineComponent = {
  name: "@narratage/caption-fine",
  producers: [{
    producer: captionFineProducers.render,
    implementationDigest: renderFineCaptionImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: { track: { kind: "inline", value: canonicalize(renderFineCaption(
        inline<TimedCaptionProjection>(inputs.caption?.value, "TimedCaptionProjection"),
        inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
        inline<CaptionWordSequence>(inputs.words?.value, "CaptionWordSequence"),
        inline<ProgramSpace>(inputs.space?.value, "ProgramSpace"),
      )) } },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
