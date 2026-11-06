import { verifyMuxedMedia } from "@hypit/media";
import type { MediaDeliverySpec, TimelineAudio, TimelineVisual } from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";

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
        const visual = valueOf(inputs.visual?.value, "TimelineVisual") as unknown as TimelineVisual;
        const audio = valueOf(inputs.audio?.value, "TimelineAudio") as unknown as TimelineAudio;
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
