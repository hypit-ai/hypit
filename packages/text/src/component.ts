import type { RefinementPackage } from "@hypit/refinement";
import type { ProducerPackage, ProducerHandlerContext } from "@hypit/producer";
import type { Value } from "@hypit/protocol";

import {
  textProducers,
  textTypes,
} from "./manifest.js";
import {
  bindText,
  renderText,
  sealTextBindings,
  verifyText,
  verifyTextBinding,
  verifyTextBindings,
  verifyTextTemplate,
} from "./program.js";
import type { Text, TextBinding, TextBindings, TextTemplate } from "./types.js";

function valueOf<T>(value: Value | undefined, subject: string): T {
  if (value === undefined) throw new Error(`${subject} is missing`);
  return value as unknown as T;
}

export const textComponent = {
  refinements: [
    { type: textTypes.text,
      handler: ({ value }) => verifyText(valueOf(value, "Text")) },
    { type: textTypes.template,
      handler: ({ value }) => verifyTextTemplate(valueOf(value, "TextTemplate")) },
    { type: textTypes.bindings,
      handler: ({ value }) => verifyTextBindings(valueOf(value, "TextBindings")) },
    { type: textTypes.binding,
      handler: ({ value }) => verifyTextBinding(valueOf(value, "TextBinding")) },
  ],
  producers: [
    {
      producer: textProducers.emptyBindings,
      handler: () => ({ kind: "output", value: (sealTextBindings()) }),
    },
    {
      producer: textProducers.bindText,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output", value: (bindText(
              valueOf<TextBindings>(inputs.bindings?.value, "Text bindings"),
              valueOf<TextBinding>(inputs.binding?.value, "Text binding"),
              valueOf<Text>(inputs.text?.value, "Text input"),
            )) }),
    },
    {
      producer: textProducers.render,
      handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output", value: (renderText(
              valueOf<TextTemplate>(inputs.template?.value, "Text template"),
              valueOf<TextBindings>(inputs.bindings?.value, "Text bindings"),
            )) }),
    },
  ],
} satisfies ProducerPackage & RefinementPackage;
