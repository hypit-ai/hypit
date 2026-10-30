import { sealMediaDeliverySpec } from "./identity.js";
import type { MediaDeliverySpec, VisualDeliverySpec } from "./types.js";

export type MediaDeliveryProfile = "bt709-h264";

/** Pure constructor shared by author Frontends and direct package callers. */
export function mediaDeliveryProfile(
  profile: MediaDeliveryProfile,
  options: {
    readonly quality?: VisualDeliverySpec["encoding"]["quality"];
    readonly matte?: string;
  } = {},
): MediaDeliverySpec {
  const quality = options.quality ?? "standard";
  const matte = options.matte ?? "#000000";
  if (profile !== "bt709-h264") throw new Error(`Unknown media delivery profile ${String(profile)}`);
  return sealMediaDeliverySpec({
    visual: {
      picture: { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
        colorRange: "limited", bitDepth: 8, alpha: { mode: "opaque", matte } },
      encoding: { codec: "h264", pixelFormat: "yuv420p", quality },
    },
    audio: { codec: "aac", sampleRate: 48_000, channelLayout: "stereo" },
    container: "mp4",
  });
}
