import { plannedNeedInputs } from "@hypit/component-kit";
import type { ComponentPackage } from "@hypit/component-kit";
import type { StoredValue } from "@hypit/protocol";

import { hyperframesVisualRequest } from "./product.js";
import { renderHyperframesCapabilities, renderHyperframesProducers } from "./manifest.js";

/** Declares the visual Need. It contains no renderer, queue, credentials or deployment choice. */
export const renderHyperframesComponent = {
  producers: [{
    producer: renderHyperframesProducers.requestVisual,
    handler: ({ inputs }) => ({
      outputs: {},
      needs: {
        visual: hyperframesVisualRequest(inline(inputs.document!.value, "HyperframesDocument") as never),
      },
    }),
  }],
  plannedNeeds: [{
    producer: renderHyperframesProducers.requestVisual,
    port: "visual",
    capability: renderHyperframesCapabilities.renderVisual,
    plan({ state, step }) {
      return { constraints: {}, pendingInputs: plannedNeedInputs(state, step) };
    },
    present(specification) {
      return { fields: {}, references: {} };
    },
  }],
} satisfies ComponentPackage;

function inline(value: StoredValue, subject: string): unknown {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}
