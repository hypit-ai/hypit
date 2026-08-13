import { narrativeTypes } from "@narratage/narrative";
import { captionTypes } from "@narratage/caption";
import { sealGraphFragment } from "@narratage/elaborator";

import { captionGeminiProducers, captionGeminiTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const captionGeminiPlanningFragment = sealGraphFragment({
  inputs: [
    { name: "display", type: narrativeTypes.captionDisplay },
    { name: "captionProgram", type: captionTypes.program },
    { name: "program", type: captionGeminiTypes.program },
  ],
  operations: [
    {
      id: "caption-gemini:compile",
      producer: captionGeminiProducers.compile,
      inputs: { display: input("display"), captionProgram: input("captionProgram"), program: input("program") },
      result: { kind: "output", name: "request" },
    },
    {
      id: "caption-gemini:plan",
      producer: captionGeminiProducers.request,
      inputs: { request: operation("caption-gemini:compile") },
      result: { kind: "need", name: "plan" },
    },
  ],
  exports: [{
    name: "plan",
    type: captionTypes.plan,
    root: operation("caption-gemini:plan"),
  }],
});
