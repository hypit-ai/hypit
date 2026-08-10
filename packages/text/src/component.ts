import type { ComponentPackage, ProducerHandlerContext } from "@narratage/component-kit";
import type { StoredValue } from "@narratage/protocol";

import {
  textImplementationDigests,
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
  name: "@narratage/text",
  validators: [
    { type: textTypes.text, implementationDigest: textImplementationDigests.validateText,
      handler: ({ value }) => verifyText(inline(value, "Text")) },
    { type: textTypes.template, implementationDigest: textImplementationDigests.validateTemplate,
      handler: ({ value }) => verifyTextTemplate(inline(value, "TextTemplate")) },
    { type: textTypes.bindings, implementationDigest: textImplementationDigests.validateBindings,
      handler: ({ value }) => verifyTextBindings(inline(value, "TextBindings")) },
    { type: textTypes.binding, implementationDigest: textImplementationDigests.validateBinding,
      handler: ({ value }) => verifyTextBinding(inline(value, "TextBinding")) },
  ],
  producers: [
    {
      producer: textProducers.emptyBindings,
      implementationDigest: textImplementationDigests.emptyBindings,
      handler: () => ({ outputs: { bindings: { kind: "inline", value: sealTextBindings() } }, needs: {} }),
    },
    {
      producer: textProducers.bindText,
      implementationDigest: textImplementationDigests.bindText,
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
      implementationDigest: textImplementationDigests.render,
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
