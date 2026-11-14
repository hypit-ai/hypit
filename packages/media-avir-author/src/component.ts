import type { PreparedMedia } from "@hypit/media";

import { programSourceFromPreparedMedia } from "@hypit/media-avir";
import { canonicalize } from "@hypit/protocol";
import type { Value } from "@hypit/protocol";
import type { ProducerPackage } from "@hypit/producer";

import { mediaAvirAuthorProducers } from "./manifest.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}

export const mediaAvirAuthorComponent = {
  producers: [
    {
      producer: mediaAvirAuthorProducers.source,
      handler: ({ inputs }) => ({
        kind: "output",
        value: canonicalize(programSourceFromPreparedMedia(
          valueOf<PreparedMedia>(inputs.media?.value, "PreparedMedia"),
        )),
      }),
    },
  ],
} satisfies { producers: ProducerPackage };
