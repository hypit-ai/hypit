import type { MediaDeliverySpec, RenderedAudio, RenderedVisual } from "@hypit/media";

export type MuxMediaNeed = {
  readonly visual: RenderedVisual;
  readonly audio: RenderedAudio;
  readonly delivery: MediaDeliverySpec;
};
