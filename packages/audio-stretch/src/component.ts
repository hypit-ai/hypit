import { canonicalize } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";

import { audioStretchProducers } from "./manifest.js";
import { preservePitch } from "./program.js";

export const audioStretchComponent = {
  producers: [{
    producer: audioStretchProducers.preservePitch,
    handler: () => ({ kind: "output" as const, value: canonicalize(preservePitch()) }),
  }],
} satisfies { producers: ProducerPackage };
