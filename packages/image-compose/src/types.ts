import type { BlobRef } from "@narratage/protocol";
import type { SpatialFrame } from "@narratage/spatial";

export type ImageComposeOptions = {
  readonly contract: "svml.image-compose-options@1";
  readonly background: string;
};

export type ImageComposeLayerSpec = {
  readonly contract: "svml.image-compose-layer-spec@1";
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
  readonly contract: "svml.image-compose-layer-set@1";
  readonly layers: readonly ImageComposeLayer[];
};
