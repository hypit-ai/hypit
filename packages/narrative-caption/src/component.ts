import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { CaptionDocument, CaptionTiming } from "@hypit/caption";
import type { ProducerPackage } from "@hypit/hypit/producer";
import type { Value } from "@hypit/hypit/protocol";
import { canonicalize } from "@hypit/hypit/protocol";
import type { NarrativeProjection } from "@hypit/narrative-temporal";

import { assertNarrativeCaptionBindingIdentity } from "./identity.js";
import { narrativeCaptionProducers, narrativeCaptionTypes } from "./manifest.js";
import { projectNarrativeCaptionTiming } from "./project.js";
import type { NarrativeCaptionBinding } from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as T;
}

export const narrativeCaptionComponent = {
  producers: [{
    producer: narrativeCaptionProducers.projectTiming,
    handler: ({ inputs }) => ({ kind: "output", value: (canonicalize(projectNarrativeCaptionTiming(
        valueOf<CaptionDocument>(inputs.document?.value, "CaptionDocument"),
        valueOf<NarrativeCaptionBinding>(inputs.binding?.value, "NarrativeCaptionBinding"),
        valueOf<NarrativeProjection>(inputs.projection?.value, "NarrativeProjection"),
      ) as CaptionTiming)) }),
  }],
  refinements: [{
    type: narrativeCaptionTypes.binding,
    handler: ({ value }) => assertNarrativeCaptionBindingIdentity(valueOf<NarrativeCaptionBinding>(value, "NarrativeCaptionBinding")),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
