import type { RefinementPackage } from "@hypit/refinement";
import type { ProducerPackage, ProducerHandlerContext } from "@hypit/producer";
import type { Value } from "@hypit/protocol";
import type { Text } from "@hypit/text";

import { promptProducers, promptTypes } from "./manifest.js";
import {
  bindPromptSlot,
  renderPrompt,
  verifyPrompt,
  verifyPromptBindings,
  verifyPromptPreset,
  verifyPromptSlotBinding,
  verifyPromptTemplate,
} from "./program.js";
import type { PromptBindings, PromptSlotBinding, PromptTemplate } from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as unknown as T;
}

export const promptComponent = {
  refinements: [
    { type: promptTypes.prompt, handler: ({ value }) => verifyPrompt(valueOf(value, "Prompt")) },
    { type: promptTypes.template, handler: ({ value }) => verifyPromptTemplate(valueOf(value, "PromptTemplate")) },
    { type: promptTypes.preset, handler: ({ value }) => verifyPromptPreset(valueOf(value, "PromptPreset")) },
    { type: promptTypes.bindings, handler: ({ value }) => verifyPromptBindings(valueOf(value, "PromptBindings")) },
    { type: promptTypes.slotBinding, handler: ({ value }) => verifyPromptSlotBinding(valueOf(value, "PromptSlotBinding")) },
  ],
  producers: [{
    producer: promptProducers.bindSlot,
    handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output", value: bindPromptSlot(
      valueOf<PromptBindings>(inputs.bindings?.value, "Prompt bindings"),
      valueOf<PromptSlotBinding>(inputs.binding?.value, "Prompt slot binding"),
      valueOf<Text>(inputs.text?.value, "Prompt slot Text"),
    ) }),
  }, {
    producer: promptProducers.render,
    handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output", value: renderPrompt(
      valueOf<PromptTemplate>(inputs.template?.value, "Prompt template"),
      valueOf<PromptBindings>(inputs.bindings?.value, "Prompt bindings"),
    ) }),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
