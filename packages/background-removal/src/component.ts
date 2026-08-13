import type { ComponentPackage, ProducerHandlerContext } from "@narratage/component-kit";
import type { StoredValue } from "@narratage/protocol";

import { backgroundRemovalImplementationDigests, backgroundRemovalProducers } from "./manifest.js";
import { backgroundRemovalRequest } from "./program.js";

function blob(value: StoredValue | undefined) {
  if (value?.kind !== "blob") throw new Error("Background Removal source must be a Blob Artifact.");
  return value;
}

export const backgroundRemovalComponent = {
  producers: [{
    producer: backgroundRemovalProducers.request,
    implementationDigest: backgroundRemovalImplementationDigests.request,
    handler: ({ inputs }: ProducerHandlerContext) => ({
      outputs: {}, needs: { image: backgroundRemovalRequest(blob(inputs.source?.value)) },
    }),
  }],
} satisfies ComponentPackage;
