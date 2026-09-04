import { plannedNeedInputs } from "@hypit/component-kit";
import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import type { StoredValue } from "@hypit/protocol";

import { backgroundRemovalCapabilities, backgroundRemovalProducers } from "./manifest.js";
import { backgroundRemovalRequest } from "./program.js";

function blob(value: StoredValue | undefined) {
  if (value?.kind !== "blob") throw new Error("Background Removal source must be a Blob Artifact.");
  return value;
}

export const backgroundRemovalComponent = {
  producers: [{
    producer: backgroundRemovalProducers.request,
    handler: ({ inputs }: ProducerHandlerContext) => ({
      outputs: {}, needs: { image: backgroundRemovalRequest(blob(inputs.source?.value)) },
    }),
  }],
  plannedNeeds: [{
    producer: backgroundRemovalProducers.request,
    port: "image",
    capability: backgroundRemovalCapabilities.remove,
    plan: ({ state, step }) => ({
      constraints: {},
      pendingInputs: plannedNeedInputs(state, step, { source: "image" }),
    }),
    present: (specification) => ({ fields: {}, references: {
      image: specification.pendingInputs.filter((input) => input.role === "image").length,
    } }),
  }],
} satisfies ComponentPackage;
