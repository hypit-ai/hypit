import { captionProducers, captionTypes } from "@hypit/caption";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";

import { captionFineProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** One timing join plus one Style-family render operation, regardless of how many Styles are used. */
export const fineCaptionTrackFragment = sealGraphFragment({
  inputs: [
    { name: "display", type: narrativeTypes.captionDisplay },
    { name: "correspondence", type: narrativeTypes.captionCorrespondence },
    { name: "semantic", type: semanticTrackTypes.track },
    { name: "plan", type: captionTypes.plan },
    { name: "program", type: captionTypes.program },
  ],
  operations: [
    {
      id: "caption:temporalize-plan",
      producer: captionProducers.temporalizePlan,
      inputs: {
        display: input("display"), correspondence: input("correspondence"), semantic: input("semantic"),
        plan: input("plan"), program: input("program"),
      },
      result: { kind: "output", name: "caption" },
    },
    {
      id: "caption-fine:render",
      producer: captionFineProducers.render,
      inputs: {
        caption: operation("caption:temporalize-plan"), program: input("program"),
        display: input("display"), semantic: input("semantic"),
      },
      result: { kind: "output", name: "track" },
    },
  ],
  exports: [{
    name: "track",
    type: compositionTypes.visualTrack,
    root: operation("caption-fine:render"),
  }],
});
