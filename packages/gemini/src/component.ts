import { plannedNeedInputs } from "@hypit/component-kit";
import type { ComponentPackage, PlannedNeedFacet, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { BuildState, CanonicalValue, StoredValue } from "@hypit/protocol";
import type { Text } from "@hypit/text";
import { verifyText } from "@hypit/text";

import { geminiCapabilities, geminiModels, geminiProducers, geminiTypes } from "./manifest.js";
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

function plannedGeminiText(state: BuildState, requestStep: string): {
  readonly instruction: string;
  readonly prompt: string;
} | undefined {
  const producedBy = new Map(state.plan.steps.flatMap((step) =>
    Object.values(step.outputs).map((record) => [record, step] as const)));
  const request = state.plan.steps.find((step) => step.id === requestStep);
  let draft = request?.inputs.request;
  const seen = new Set<string>();
  while (draft !== undefined && !seen.has(draft)) {
    seen.add(draft);
    const existing = state.records.find((record) => record.id === draft)?.value;
    if (existing?.kind === "inline") {
      const value = existing.value as Readonly<Record<string, CanonicalValue>>;
      if (typeof value.instruction === "string" && typeof value.prompt === "string") {
        return { instruction: value.instruction, prompt: value.prompt };
      }
    }
    const producer = producedBy.get(draft);
    if (producer === undefined) return undefined;
    if (producer.producer.name === geminiProducers.finalize.name) {
      draft = producer.inputs.draft;
      continue;
    }
    if (producer.producer.name === geminiProducers.bindMedia.name) {
      draft = producer.inputs.draft;
      continue;
    }
    if (producer.producer.name !== geminiProducers.start.name) return undefined;
    const readText = (input: string): string | undefined => {
      const record = producer.inputs[input];
      const stored = record === undefined ? undefined : state.records.find((item) => item.id === record)?.value;
      if (stored?.kind !== "inline" || stored.value === null || typeof stored.value !== "object" || Array.isArray(stored.value)) return undefined;
      const value = (stored.value as Readonly<Record<string, CanonicalValue>>).value;
      return typeof value === "string" ? value : undefined;
    };
    const instruction = readText("instruction");
    const prompt = readText("prompt");
    return instruction === undefined || prompt === undefined ? undefined : { instruction, prompt };
  }
  return undefined;
}

const plannedGeminiNeeds: readonly PlannedNeedFacet[] = geminiModels.map((model) => ({
  producer: geminiProducers[model],
  port: "observation",
  capability: geminiCapabilities[model],
  plan({ state, step }) {
    const authored = plannedGeminiText(state, step);
    if (authored === undefined) return undefined;
    return {
      constraints: authored,
      pendingInputs: plannedNeedInputs(state, step),
    };
  },
  present(specification) {
    const fields = specification.constraints as Readonly<Record<string, CanonicalValue>>;
    return {
      fields: {
        ...(typeof fields.instruction === "string" ? { instruction: [fields.instruction] } : {}),
        ...(typeof fields.prompt === "string" ? { prompt: [fields.prompt] } : {}),
      },
      references: {},
    };
  },
}));

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
  plannedNeeds: plannedGeminiNeeds,
} satisfies ComponentPackage;
