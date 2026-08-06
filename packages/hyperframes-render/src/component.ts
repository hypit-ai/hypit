import type { ComponentPackage } from "@svml/component-kit";
import type { StoredValue } from "@svml/protocol";

import {
  hyperframesVisualRequest,
  requestHyperframesVisualImplementationDigest,
} from "./product.js";
import { hyperframesRenderProducers } from "./manifest.js";

/** Declares the visual Need. It contains no renderer, queue, credentials or deployment choice. */
export const hyperframesRenderComponent = {
  name: "@svml/hyperframes-render",
  producers: [{
    producer: hyperframesRenderProducers.requestVisual,
    implementationDigest: requestHyperframesVisualImplementationDigest,
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
