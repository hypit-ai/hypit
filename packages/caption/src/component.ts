import type { ComponentPackage } from "@hypit/component-kit";
import type { CaptionDocument } from "@hypit/narrative";
import type { SemanticTrack } from "@hypit/semantic-track";
import type { StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { captionProducers, captionTypes } from "./manifest.js";
import { assertCaptionProgram } from "./style.js";
import { assertTimedCaptionProjection, temporalizeCaptionDocument } from "./temporalize.js";
import type { CaptionProgram, CaptionStyleIntent, TimedCaptionProjection } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

export const captionComponent = {
  producers: [{
    producer: captionProducers.temporalizeDocument,
    handler: ({ inputs }) => ({
      outputs: { caption: { kind: "inline", value: canonicalize(temporalizeCaptionDocument(
        inline<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
        inline<SemanticTrack>(inputs.semantic?.value, "SemanticTrack"),
        inline<CaptionProgram>(inputs.program?.value, "CaptionProgram"),
      )) } },
      needs: {},
    }),
  }],
  validators: [
    { type: captionTypes.style, handler: ({ value }) => {
      if (value.kind !== "inline") throw new Error("CaptionStyle must be inline");
      const style = value.value as CaptionStyleIntent;
      if (!style.id || !style.rendering?.family) throw new Error("CaptionStyle is invalid");
    } },
    { type: captionTypes.program, handler: ({ value }) => assertCaptionProgram(inline<CaptionProgram>(value, "CaptionProgram")) },
    { type: captionTypes.timedProjection, handler: ({ value }) => assertTimedCaptionProjection(inline<TimedCaptionProjection>(value, "TimedCaptionProjection")) },
  ],
} satisfies ComponentPackage;
