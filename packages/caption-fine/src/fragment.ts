import { captionProducers, captionTypes } from "@narratage/caption";
import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";

import { captionFineProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** One timing join plus one Style-family render operation, regardless of how many Styles are used. */
export const fineCaptionTrackFragment = sealGraphFragment({
  name: "@narratage/caption-fine/track@1",
  inputs: [
    { name: "display", type: narrativeTypes.captionDisplay },
    { name: "correspondence", type: narrativeTypes.captionCorrespondence },
    { name: "map", type: semanticMapTypes.complete },
    { name: "plan", type: captionTypes.plan },
    { name: "program", type: captionTypes.program },
    { name: "space", type: programSpaceTypes.programSpace },
  ],
  operations: [
    {
      id: "caption:temporalize-plan",
      producer: captionProducers.temporalizePlan,
      inputs: {
        display: input("display"), correspondence: input("correspondence"), map: input("map"),
        plan: input("plan"), program: input("program"),
      },
      result: { kind: "output", name: "caption" },
    },
    {
      id: "caption-fine:render",
      producer: captionFineProducers.render,
      inputs: {
        caption: operation("caption:temporalize-plan"), program: input("program"),
        display: input("display"), space: input("space"),
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
