import type { RefinementPackage } from "@hypit/hypit/refinement";
import type { Value } from "@hypit/hypit/protocol";

import { timedTranscriptTypes } from "./contract.js";
import { assertTimedTranscript } from "./document.js";

export const timedTranscriptComponent = {
  refinements: [{
    type: timedTranscriptTypes.transcript,
    handler: ({ value }) => {
      if (value === undefined) throw new Error("TimedTranscript is missing.");
      assertTimedTranscript(value as Value);
    },
  }],
} satisfies { refinements?: RefinementPackage };
