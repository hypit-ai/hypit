import { frameSpanSamples } from "@hypit/temporal";
import {
  sameVisualDeliverySpec,
  verifyMediaDeliverySpec,
  verifyMuxedMedia,
  verifyTimelineAudio,
  verifyTimelineVisual,
} from "@hypit/media";
import type {
  MediaDeliverySpec,
  MuxedMedia,
  TimelineAudio,
  TimelineVisual,
} from "@hypit/media";

import type { MuxMediaNeed } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Close two rendered terminal products into one exact mux request. */
export function createMuxMediaNeed(
  visual: TimelineVisual,
  audio: TimelineAudio,
  delivery: MediaDeliverySpec,
): MuxMediaNeed {
  verifyTimelineVisual(visual);
  verifyTimelineAudio(audio);
  verifyMediaDeliverySpec(delivery);
  if (!sameVisualDeliverySpec(visual.delivery, delivery.visual)) {
    throw new Error("Rendered visual implements a different delivery requirement.");
  }
  const { sampleFrames } = frameSpanSamples(
    { startFrame: 0, endFrameExclusive: visual.frameCount },
    { frameRate: visual.frameRate },
    delivery.audio.sampleRate,
  );
  if (audio.sampleFrames !== sampleFrames) {
    throw new Error("Rendered visual and TimelineAudio have different presentation durations.");
  }
  return structuredClone({ visual, audio, delivery });
}

/** Verify that a mux executor fulfilled the exact request rather than another delivery. */
export function verifyMuxedMediaForNeed(value: unknown, need: MuxMediaNeed): asserts value is MuxedMedia {
  const expected = createMuxMediaNeed(need.visual, need.audio, need.delivery);
  verifyMuxedMedia(value);
  assert(value.frameRate.numerator === expected.visual.frameRate.numerator
    && value.frameRate.denominator === expected.visual.frameRate.denominator,
  "Muxed media uses another frame rate.");
  assert(value.frameCount === expected.visual.frameCount,
    "Muxed media uses another frame count.");
  assert(value.canvas.width === expected.visual.canvas.width
    && value.canvas.height === expected.visual.canvas.height,
  "Muxed media uses another canvas.");
  assert(sameVisualDeliverySpec(value.delivery.visual, expected.delivery.visual)
    && value.delivery.audio.codec === expected.delivery.audio.codec
    && value.delivery.audio.sampleRate === expected.delivery.audio.sampleRate
    && value.delivery.audio.channelLayout === expected.delivery.audio.channelLayout
    && value.delivery.container === expected.delivery.container,
  "Muxed media implements another delivery requirement.");
}
