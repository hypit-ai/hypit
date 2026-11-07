import { verifyMuxedMedia } from "@hypit/media";
import type { MediaDeliverySpec, RenderedAudio, RenderedVisual } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { Value } from "@hypit/protocol";
import type { ProducerPackage } from "@hypit/producer";

import { mediaDeliveryProducers } from "./manifest.js";
import { createMuxMediaNeed } from "./request.js";
import type { MuxMediaNeed } from "./types.js";

function valueOf(value: Value | undefined, subject: string): Value {
  if (value === undefined) throw new Error(`${subject} is missing.`);
  return value;
}

export const mediaDeliveryComponent = {
  producers: [
    {
      producer: mediaDeliveryProducers.mux,
      handler: ({ inputs }) => {
        const visual = valueOf(inputs.visual?.value, "RenderedVisual") as unknown as RenderedVisual;
        const audio = valueOf(inputs.audio?.value, "RenderedAudio") as unknown as RenderedAudio;
        const delivery = valueOf(inputs.delivery?.value, "MediaDeliverySpec") as unknown as MediaDeliverySpec;
        return {
          kind: "need",
          constraints: canonicalize(createMuxMediaNeed(visual, audio, delivery) satisfies MuxMediaNeed),
        };
      },
    },
    {
      producer: mediaDeliveryProducers.projectVideo,
      handler: ({ inputs }) => {
        const media = valueOf(inputs.media?.value, "MuxedMedia");
        verifyMuxedMedia(media);
        return { kind: "output", value: media.artifact };
      },
    },
  ],
} satisfies { producers?: ProducerPackage };
