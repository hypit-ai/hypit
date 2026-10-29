import { sealMediaDeliverySpec } from "./identity.js";
import type { HdrStaticMetadata, MediaDeliverySpec, VisualDeliverySpec } from "./types.js";

export type MediaDeliveryProfile = "bt709-h264" | "hdr10-hevc";

/** Pure constructor shared by author Frontends and direct package callers. */
export function mediaDeliveryProfile(
  profile: MediaDeliveryProfile,
  options: {
    readonly quality?: VisualDeliverySpec["encoding"]["quality"];
    readonly matte?: string;
    readonly hdrStaticMetadata?: HdrStaticMetadata;
  } = {},
): MediaDeliverySpec {
  const quality = options.quality ?? "standard";
  const matte = options.matte ?? "#000000";
  if (profile === "hdr10-hevc" && options.hdrStaticMetadata === undefined) {
    throw new Error("Media delivery profile hdr10-hevc requires HDR static metadata");
  }
  if (profile === "bt709-h264" && options.hdrStaticMetadata !== undefined) {
    throw new Error("Media delivery profile bt709-h264 cannot carry HDR static metadata");
  }
  const hdr = profile === "hdr10-hevc";
  return sealMediaDeliverySpec({
    visual: {
      picture: hdr
        ? { colorPrimaries: "bt2020", colorTransfer: "pq", colorMatrix: "bt2020-ncl",
            colorRange: "limited", bitDepth: 10, alpha: { mode: "opaque", matte } }
        : { colorPrimaries: "bt709", colorTransfer: "bt709", colorMatrix: "bt709",
            colorRange: "limited", bitDepth: 8, alpha: { mode: "opaque", matte } },
      encoding: hdr
        ? { codec: "hevc", pixelFormat: "yuv420p10le", quality }
        : { codec: "h264", pixelFormat: "yuv420p", quality },
      ...(options.hdrStaticMetadata === undefined ? {} : { hdrStaticMetadata: options.hdrStaticMetadata }),
    },
    audio: { codec: "aac", sampleRate: 48_000, channelLayout: "stereo" },
    container: "mp4",
  });
}
