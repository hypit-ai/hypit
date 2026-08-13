import type { BlobRef } from "@narratage/protocol";
import type { SpatialFrame } from "@narratage/spatial";

export type ImageComposeOptions = {
  readonly background: string;
};

export type ImageComposeLayerSpec = {
  readonly fit: "contain" | "cover" | "stretch";
  readonly interpolation: "nearest" | "linear" | "cubic" | "area" | "lanczos";
  readonly opacity: number;
};

export type ImageComposeLayer = {
  readonly source: BlobRef;
  readonly frame: SpatialFrame;
  readonly spec: ImageComposeLayerSpec;
};

export type ImageComposeLayerSet = {
  readonly layers: readonly ImageComposeLayer[];
};
