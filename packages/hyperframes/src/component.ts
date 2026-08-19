import type { ComponentPackage } from "@hypit/component-kit";
import type { ProgramSpace } from "@hypit/program-space";
import type { Composition } from "@hypit/composition";
import type { CanonicalValue, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";

import { compileHyperframesDocument } from "./document.js";
import { hyperframesProducers } from "./manifest.js";

function inline(value: StoredValue, subject: string): CanonicalValue {
  if (value.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value;
}

/** Trusted deterministic lowering only; this component never renders frames or reads Artifacts. */
export const hyperframesComponent = {
  producers: [{
    producer: hyperframesProducers.compile,
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
