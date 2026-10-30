import type {
  PictureSignal,
  PictureInterpretation,
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
  name: "srgb" | "sdr-bt709",
): PictureInterpretation {
  if (name === "srgb") return structuredClone(SRGB_STRAIGHT_PICTURE);
  if (name === "sdr-bt709") return structuredClone(BT709_OPAQUE_PICTURE);
  throw new Error(`Unknown picture interpretation profile ${String(name)}`);
}
