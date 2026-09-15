import { plannedNeedInputs } from "@hypit/component-kit";
import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import { canonicalize } from "@hypit/protocol";
import type { StoredValue } from "@hypit/protocol";

import { orcaRouterCapabilities, orcaRouterProducers } from "./manifest.js";
import { assertOrcaRouterChatRequest } from "./program.js";
import type { OrcaRouterChatRequest } from "./types.js";

function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as T;
}

/**
 * The Surface seals the complete request — model, prompt Text and attached image Artifacts — into one
 * Record, so this producer asks for the external Need without a graph to reverse-engineer and the
 * Provider receives exactly what was authored.
 */
export const orcaRouterComponent = {
  producers: [{
    producer: orcaRouterProducers.request,
    handler: ({ inputs }: ProducerHandlerContext) => {
      const request = inline<OrcaRouterChatRequest>(inputs.request?.value, "OrcaRouter chat request");
      assertOrcaRouterChatRequest(request);
      return { outputs: {}, needs: { chat: canonicalize(request) } };
    },
  }],
  plannedNeeds: [{
    producer: orcaRouterProducers.request,
    port: "chat",
    capability: orcaRouterCapabilities.generate,
    plan: ({ state, step }) => ({
      constraints: {},
      pendingInputs: plannedNeedInputs(state, step, { request: "request" }),
    }),
    present: (specification) => ({
      fields: {},
      references: {
        image: specification.pendingInputs.filter((input) => input.role === "image").length,
      },
    }),
  }],
} satisfies ComponentPackage;
