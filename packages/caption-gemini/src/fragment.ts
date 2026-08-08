import { narrativeTypes } from "@narratage/narrative";
import { captionTypes } from "@narratage/caption";
import { sealGraphFragment } from "@narratage/elaborator";

import { captionGeminiProducers, captionGeminiTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const captionGeminiPlanningFragment = sealGraphFragment({
  name: "@narratage/caption-gemini/planning@1",
  inputs: [
    { name: "words", type: narrativeTypes.captionWordSequence },
    { name: "captionProgram", type: captionTypes.program },
    { name: "program", type: captionGeminiTypes.program },
  ],
  operations: [
    {
      id: "caption-gemini:compile",
      producer: captionGeminiProducers.compile,
      inputs: { words: input("words"), captionProgram: input("captionProgram"), program: input("program") },
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
    semanticInputs: ["words", "captionProgram", "program"],
    fidelity: "exact",
  }],
});
