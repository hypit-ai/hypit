import type { ComponentPackage, ProducerHandlerContext } from "@narratage/component-kit";
import type { StoredValue } from "@narratage/protocol";

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

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const textComponent = {
  validators: [
    { type: textTypes.text,
      handler: ({ value }) => verifyText(inline(value, "Text")) },
    { type: textTypes.template,
      handler: ({ value }) => verifyTextTemplate(inline(value, "TextTemplate")) },
    { type: textTypes.bindings,
      handler: ({ value }) => verifyTextBindings(inline(value, "TextBindings")) },
    { type: textTypes.binding,
      handler: ({ value }) => verifyTextBinding(inline(value, "TextBinding")) },
  ],
  producers: [
    {
      producer: textProducers.emptyBindings,
      handler: () => ({ outputs: { bindings: { kind: "inline", value: sealTextBindings() } }, needs: {} }),
    },
    {
      producer: textProducers.bindText,
      handler: ({ inputs }: ProducerHandlerContext) => ({
        outputs: {
          bindings: {
            kind: "inline",
            value: bindText(
              inline<TextBindings>(inputs.bindings?.value, "Text bindings"),
              inline<TextBinding>(inputs.binding?.value, "Text binding"),
              inline<Text>(inputs.text?.value, "Text input"),
            ),
          },
        },
        needs: {},
      }),
    },
    {
      producer: textProducers.render,
      handler: ({ inputs }: ProducerHandlerContext) => ({
        outputs: {
          text: {
            kind: "inline",
            value: renderText(
              inline<TextTemplate>(inputs.template?.value, "Text template"),
              inline<TextBindings>(inputs.bindings?.value, "Text bindings"),
            ),
          },
        },
        needs: {},
      }),
    },
  ],
} satisfies ComponentPackage;
