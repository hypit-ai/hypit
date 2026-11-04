import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";

import { audioPreservePitchProducers } from "./manifest.js";
import { preservePitch } from "./program.js";

export const audioPreservePitchComponent = {
  producers: [{
    producer: audioPreservePitchProducers.preservePitch,
    handler: () => ({ kind: "output" as const, value: canonicalize(preservePitch()) }),
  }],
} satisfies { producers: ProducerPackage };
