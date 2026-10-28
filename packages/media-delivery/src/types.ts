import type { MediaDeliverySpec, TimelineAudio, TimelineVisual } from "@hypit/media";

export type MuxMediaNeed = {
  readonly visual: TimelineVisual;
  readonly audio: TimelineAudio;
  readonly delivery: MediaDeliverySpec;
};
