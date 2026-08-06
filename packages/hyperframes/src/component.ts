import type { Composition } from "@svml/contracts";
import type { CanonicalValue, StoredValue } from "@svml/protocol";
import { canonicalize } from "@svml/protocol";

import {
  compileHyperframesDocument,
  compileHyperframesImplementationDigest,
} from "./document.js";
import { hyperframesProducers } from "./manifest.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

/** Trusted deterministic lowering only; this component never renders frames or reads Artifacts. */
export const hyperframesComponent = {
  name: "@svml/hyperframes",
  install(registry: import("@svml/driver-node").HostRegistry): void {
    registry.registerProducer(
      hyperframesProducers.compile,
      compileHyperframesImplementationDigest,
      ({ inputs }) => ({
        outputs: {
          document: {
            kind: "inline",
            value: canonicalize(compileHyperframesDocument(
              inline(inputs.composition!.value, "Composition") as unknown as Composition,
            )),
          },
        },
        needs: {},
      }),
    );
  },
};
