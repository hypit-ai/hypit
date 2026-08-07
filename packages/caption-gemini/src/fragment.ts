import { contractTypes } from "@narratage/contracts";
import { captionTypes } from "@narratage/caption";
import { sealGraphFragment } from "@narratage/elaborator";

import { captionGeminiProducers, captionGeminiTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const captionGeminiPlanningFragment = sealGraphFragment({
  name: "@narratage/caption-gemini/planning@1",
  inputs: [
    { name: "narrative", type: contractTypes.narrative },
    { name: "captionProgram", type: captionTypes.program },
    { name: "program", type: captionGeminiTypes.program },
  ],
  operations: [
    {
      id: "caption-gemini:compile",
      producer: captionGeminiProducers.compile,
      inputs: { narrative: input("narrative"), captionProgram: input("captionProgram"), program: input("program") },
      result: { kind: "output", name: "request" },
    },
    {
      id: "caption-gemini:plan",
      producer: captionGeminiProducers.request,
      inputs: { request: operation("caption-gemini:compile") },
      result: { kind: "need", name: "plan", accepts: "exact" },
    },
  ],
  exports: [{
    name: "plan",
    type: captionTypes.plan,
    root: operation("caption-gemini:plan"),
    semanticInputs: ["narrative", "captionProgram", "program"],
    fidelity: "exact",
  }],
});
