import { sealMediaDeliverySpec } from "@hypit/media";
import type { MediaDeliverySpec, VisualDeliverySpec } from "@hypit/media";

/** Explicit standard delivery selected by the HTML Video author declaration. */
export function htmlVideoDeliverySpec(
  quality: VisualDeliverySpec["encoding"]["quality"] = "standard",
): MediaDeliverySpec {
  return sealMediaDeliverySpec({
    visual: {
      picture: {
        colorPrimaries: "bt709",
        colorTransfer: "bt709",
        colorMatrix: "bt709",
        colorRange: "limited",
        bitDepth: 8,
        alpha: { mode: "opaque", matte: "#000000" },
      },
      encoding: { codec: "h264", pixelFormat: "yuv420p", quality },
    },
    audio: { codec: "aac", sampleRate: 48_000, channelLayout: "stereo" },
    container: "mp4",
  });
}
