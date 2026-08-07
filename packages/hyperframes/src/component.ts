import type { ComponentPackage } from "@narratage/component-kit";
import type { Composition, ProgramSpace } from "@narratage/video-contracts";
import type { CanonicalValue, StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";

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
  name: "@narratage/hyperframes",
  producers: [{
    producer: hyperframesProducers.compile,
    implementationDigest: compileHyperframesImplementationDigest,
    handler: ({ inputs }) => ({
      outputs: {
        document: {
          kind: "inline",
          value: canonicalize(compileHyperframesDocument(
            inline(inputs.composition!.value, "Composition") as unknown as Composition,
            inline(inputs.space!.value, "ProgramSpace") as unknown as ProgramSpace,
          )),
        },
      },
      needs: {},
    }),
  }],
} satisfies ComponentPackage;
