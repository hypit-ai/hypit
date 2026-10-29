import { mediaDeliveryProfile } from "@hypit/media";
import type { MediaDeliverySpec, VisualDeliverySpec } from "@hypit/media";

/** Explicit standard delivery selected by the HTML Video author declaration. */
export function htmlVideoDeliverySpec(
  quality: VisualDeliverySpec["encoding"]["quality"] = "standard",
): MediaDeliverySpec {
  return mediaDeliveryProfile("bt709-h264", { quality });
}
