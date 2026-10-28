import { clockFrameSpanSamples } from "@hypit/timeline";
import {
  sameVisualDeliverySpec,
  verifyMediaDeliverySpec,
  verifyMuxedMedia,
  verifyTimelineAudio,
  verifyTimelineVisual,
} from "@hypit/media";
import type { MediaDeliverySpec, TimelineAudio, TimelineVisual } from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import type { Value } from "@hypit/hypit/protocol";
import type { ProducerPackage } from "@hypit/hypit/producer";

import { mediaDeliveryProducers } from "./manifest.js";
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
        verifyTimelineVisual(visual);
        verifyTimelineAudio(audio);
        verifyMediaDeliverySpec(delivery);
        if (!sameVisualDeliverySpec(visual.delivery, delivery.visual)) {
          throw new Error("Rendered visual implements a different delivery requirement.");
        }
        if (audio.sampleRate !== delivery.audio.sampleRate || audio.channelLayout !== delivery.audio.channelLayout) {
          throw new Error("Rendered audio implements a different delivery requirement.");
        }
        const { sampleFrames } = clockFrameSpanSamples(
          { startFrame: 0, endFrameExclusive: visual.frameCount },
          { frameRate: visual.frameRate },
          delivery.audio.sampleRate,
        );
        if (audio.sampleFrames !== sampleFrames) {
          throw new Error("Rendered visual and TimelineAudio have different presentation durations.");
        }
        return {
          kind: "need",
          constraints: canonicalize({ visual, audio, delivery } satisfies MuxMediaNeed),
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
