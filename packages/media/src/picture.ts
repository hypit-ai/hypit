import type { PictureInterpretation } from "./types.js";

export const SRGB_OPAQUE_PICTURE: PictureInterpretation = {
  colorPrimaries: "bt709",
  colorTransfer: "srgb",
  colorMatrix: "rgb",
  colorRange: "full",
  bitDepth: 8,
  alphaMode: "opaque",
};

export const SRGB_STRAIGHT_PICTURE: PictureInterpretation = {
  ...SRGB_OPAQUE_PICTURE,
  alphaMode: "straight",
};

export const BT709_OPAQUE_PICTURE: PictureInterpretation = {
  colorPrimaries: "bt709",
  colorTransfer: "bt709",
  colorMatrix: "bt709",
  colorRange: "limited",
  bitDepth: 8,
  alphaMode: "opaque",
};

export function pictureInterpretationProfile(name: "srgb" | "sdr-bt709"): PictureInterpretation {
  return structuredClone(name === "srgb" ? SRGB_OPAQUE_PICTURE : BT709_OPAQUE_PICTURE);
}
