import type { PreparedMedia } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { Value } from "@hypit/protocol";
import type { ProducerPackage } from "@hypit/producer";

import { audiovisualMediaProducers } from "./manifest.js";
import { programSourceFromPreparedMedia } from "./source.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const audiovisualMediaComponent = {
  producers: [
    {
      producer: audiovisualMediaProducers.source,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(programSourceFromPreparedMedia(
          valueOf<PreparedMedia>(inputs.media?.value, "PreparedMedia"),
        )),
      }),
    },
  ],
} satisfies { producers: ProducerPackage };
