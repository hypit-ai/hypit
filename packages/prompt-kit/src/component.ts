import type { ComponentPackage } from "@svml/component-kit";
import type { StoredValue } from "@svml/protocol";

import {
  promptKitImplementationDigests,
  promptKitTypes,
} from "./manifest.js";
import {
  verifyPromptKitInvocation,
  verifyPromptKitSpec,
  verifyPromptProgram,
} from "./program.js";
function inline<T>(value: StoredValue | undefined, subject: string): T {
  if (value?.kind !== "inline") throw new Error(`${subject} must be inline`);
  return value.value as unknown as T;
}

export const promptKitComponent = {
  name: "@svml/prompt-kit",
  validators: [
    {
      type: promptKitTypes.spec,
      implementationDigest: promptKitImplementationDigests.specValidator,
      handler: ({ value }) => verifyPromptKitSpec(inline(value, "PromptKitSpec")),
    },
    {
      type: promptKitTypes.invocation,
      implementationDigest: promptKitImplementationDigests.invocationValidator,
      handler: ({ value }) => verifyPromptKitInvocation(inline(value, "PromptKitInvocation")),
    },
    {
      type: promptKitTypes.program,
      implementationDigest: promptKitImplementationDigests.programValidator,
      handler: ({ value }) => verifyPromptProgram(inline(value, "PromptProgram")),
    },
  ],
} satisfies ComponentPackage;
