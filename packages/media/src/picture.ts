import type {
  PictureSignal,
  PictureInterpretation,
  WorkingPictureSpec,
} from "./types.js";

export const SRGB_STRAIGHT_PICTURE = {
  colorPrimaries: "bt709",
  colorTransfer: "srgb",
  colorMatrix: "rgb",
  colorRange: "full",
  bitDepth: 8,
  alphaMode: "straight",
} as const satisfies PictureInterpretation;

export const SRGB_OPAQUE_PICTURE = {
  ...SRGB_STRAIGHT_PICTURE,
  alphaMode: "opaque",
} as const satisfies PictureInterpretation;

export const BT709_OPAQUE_PICTURE = {
  colorPrimaries: "bt709",
  colorTransfer: "bt709",
  colorMatrix: "bt709",
  colorRange: "limited",
  bitDepth: 8,
  alphaMode: "opaque",
} as const satisfies PictureInterpretation;

export const BT2020_PQ10_OPAQUE_PICTURE = {
  colorPrimaries: "bt2020",
  colorTransfer: "pq",
  colorMatrix: "bt2020-ncl",
  colorRange: "limited",
  bitDepth: 10,
  alphaMode: "opaque",
} as const satisfies PictureInterpretation;

export const BT2020_HLG10_OPAQUE_PICTURE = {
  ...BT2020_PQ10_OPAQUE_PICTURE,
  colorTransfer: "hlg",
} as const satisfies PictureInterpretation;

/** Current exact HTML/CSS Program semantics; not an HDR claim. */
export const SDR_SRGB_WORKING_PICTURE = {
  colorPrimaries: "bt709",
  colorTransfer: "srgb",
  referenceWhiteNits: 100,
  alphaMode: "premultiplied",
} as const satisfies WorkingPictureSpec;

export function pictureSignal(value: PictureInterpretation): PictureSignal {
  return {
    colorPrimaries: value.colorPrimaries,
    colorTransfer: value.colorTransfer,
    colorMatrix: value.colorMatrix,
    colorRange: value.colorRange,
    bitDepth: value.bitDepth,
  };
}

export function pictureInterpretationProfile(
  name: "srgb" | "sdr-bt709" | "bt2100-pq10" | "bt2100-hlg10",
): PictureInterpretation {
  if (name === "srgb") return structuredClone(SRGB_STRAIGHT_PICTURE);
  if (name === "sdr-bt709") return structuredClone(BT709_OPAQUE_PICTURE);
  if (name === "bt2100-pq10") return structuredClone(BT2020_PQ10_OPAQUE_PICTURE);
  if (name === "bt2100-hlg10") return structuredClone(BT2020_HLG10_OPAQUE_PICTURE);
  throw new Error(`Unknown picture interpretation profile ${String(name)}`);
}
