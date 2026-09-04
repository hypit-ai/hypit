import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";
import type { Text } from "@hypit/text";
import { verifyText } from "@hypit/text";

import { geminiModels, geminiProducers, geminiTypes } from "./manifest.js";
import { sealGeminiRequest, verifyGeminiRequest } from "./request.js";
import type { GeminiRequest } from "./request.js";
import { verifyVisualObservation } from "./observation.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

function text(value: StoredValue | undefined, subject: string): string {
  const result = inline<Text>(value, subject);
  verifyText(result);
  return result.value;
}

export const geminiComponent = {
  validators: [
    { type: geminiTypes.request, handler: ({ value }) => verifyGeminiRequest(inline(value, "Gemini request")) },
    { type: geminiTypes.draft, handler: ({ value }) => verifyGeminiRequest(inline(value, "Gemini request draft")) },
    { type: geminiTypes.visualObservation, handler: ({ value }) => verifyVisualObservation(inline(value, "Gemini Visual Observation")) },
  ],
  producers: [
    {
      producer: geminiProducers.start,
      handler: ({ inputs }: ProducerHandlerContext) => ({
        outputs: { draft: { kind: "inline", value: canonicalize(sealGeminiRequest({
          instruction: text(inputs.instruction?.value, "Gemini instruction"),
          prompt: text(inputs.prompt?.value, "Gemini prompt"),
          media: [],
        })) } },
        needs: {},
      }),
    },
    {
      producer: geminiProducers.bindMedia,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const draft = inline<GeminiRequest>(inputs.draft?.value, "Gemini request draft");
        verifyGeminiRequest(draft);
        const artifact = inputs.media?.value;
        if (artifact?.kind !== "blob") throw new Error("Gemini media must be a Blob Artifact");
        return {
          outputs: { draft: { kind: "inline", value: canonicalize(sealGeminiRequest({
            ...draft, media: [...draft.media, { artifact }],
          })) } },
          needs: {},
        };
      },
    },
    {
      producer: geminiProducers.finalize,
      handler: ({ inputs }: ProducerHandlerContext) => {
        const draft = inline<GeminiRequest>(inputs.draft?.value, "Gemini request draft");
        verifyGeminiRequest(draft);
        return { outputs: { request: { kind: "inline", value: canonicalize(draft) } }, needs: {} };
      },
    },
    ...geminiModels.map((model) => ({
      producer: geminiProducers[model],
      handler: ({ inputs }: ProducerHandlerContext) => {
        const request = inline<GeminiRequest>(inputs.request?.value, `${model} request`);
        verifyGeminiRequest(request);
        return { outputs: {}, needs: { observation: canonicalize(request) } };
      },
    })),
  ],
} satisfies ComponentPackage;
