import type { ComponentPackage } from "@narratage/component-kit";
import type { StoredValue } from "@narratage/protocol";

import { hyperframesVisualRequest } from "./product.js";
import { renderHyperframesProducers } from "./manifest.js";

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
} satisfies ComponentPackage;

function inline(value: StoredValue, subject: string): unknown {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}
