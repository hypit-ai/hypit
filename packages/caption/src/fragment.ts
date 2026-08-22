import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { sealGraphFragment } from "@hypit/elaborator";

import { captionProducers, captionTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const captionTimingFragment = sealGraphFragment({
  inputs: [
    { name: "document", type: narrativeTypes.captionDocument },
    { name: "semantic", type: semanticTrackTypes.track },
    { name: "program", type: captionTypes.program },
  ],
  operations: [{
    id: "temporalize-caption-document",
    producer: captionProducers.temporalizeDocument,
    inputs: { document: input("document"), semantic: input("semantic"), program: input("program") },
    result: { kind: "output", name: "caption" },
  }],
  exports: [{ name: "caption", type: captionTypes.timedProjection, root: operation("temporalize-caption-document") }],
});

/** Kept as the fragment's public name for callers that only know the old export. */
export const plannedCaptionTimingFragment = captionTimingFragment;
