import type { BlobRef } from "@narratage/protocol";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";

export type RasterInterpolation = "nearest" | "linear" | "cubic" | "area" | "lanczos";
export type RasterFit = "contain" | "cover" | "stretch";

export type RasterCropOperation = {
  readonly kind: "crop"; readonly unit: "fraction" | "pixel";
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
};
export type RasterResizeOperation = {
  readonly kind: "resize"; readonly width: number; readonly height: number;
  readonly fit: RasterFit; readonly interpolation: RasterInterpolation; readonly background?: string;
};
export type RasterRotateOperation = { readonly kind: "rotate"; readonly degrees: 90 | 180 | 270 };
export type RasterFlipOperation = { readonly kind: "flip"; readonly axis: "horizontal" | "vertical" | "both" };
export type RasterDenoiseOperation = {
  readonly kind: "denoise"; readonly method: "nlm-ycrcb";
  readonly lumaStrength: number; readonly chromaStrength: number;
  readonly templateWindow: number; readonly searchWindow: number; readonly saturationRecovery: number;
};
export type RasterColorOperation = {
  readonly kind: "color"; readonly exposureStops: number; readonly contrast: number;
  readonly saturation: number; readonly temperature: number; readonly tint: number; readonly gamma: number;
};
export type RasterSharpenOperation = {
  readonly kind: "sharpen"; readonly amount: number; readonly radius: number; readonly threshold: number;
};
export type RasterBlurOperation = { readonly kind: "blur"; readonly sigma: number };
export type RasterAlphaOperation = {
  readonly kind: "alpha"; readonly mode: "preserve" | "flatten"; readonly background?: string;
};
export type RasterEncodeOperation = {
  readonly kind: "encode"; readonly format: "png" | "jpeg" | "webp";
  readonly quality?: number; readonly background?: string;
};
export type RasterTransformOperation =
  | RasterCropOperation | RasterResizeOperation | RasterRotateOperation | RasterFlipOperation
  | RasterDenoiseOperation | RasterColorOperation | RasterSharpenOperation | RasterBlurOperation
  | RasterAlphaOperation | RasterEncodeOperation;

export type RasterLayer = {
  readonly source: BlobRef;
  readonly frame: SpatialFrame;
  readonly fit: RasterFit;
  readonly interpolation: RasterInterpolation;
  readonly opacity: number;
};

export type RasterTransformRequest = {
  readonly kind: "transform";
  readonly source: BlobRef;
  readonly operations: readonly RasterTransformOperation[];
};
export type RasterComposeRequest = {
  readonly kind: "compose";
  readonly canvas: CanvasSpace;
  readonly background: string;
  readonly layers: readonly RasterLayer[];
};
export type RasterRequest = RasterTransformRequest | RasterComposeRequest;
