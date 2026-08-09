import type { RasterTransformOperation } from "@narratage/raster";

export type {
  RasterAlphaOperation as ImageAlphaOperation,
  RasterBlurOperation as ImageBlurOperation,
  RasterColorOperation as ImageColorOperation,
  RasterCropOperation as ImageCropOperation,
  RasterDenoiseOperation as ImageDenoiseOperation,
  RasterEncodeOperation as ImageEncodeOperation,
  RasterFlipOperation as ImageFlipOperation,
  RasterResizeOperation as ImageResizeOperation,
  RasterRotateOperation as ImageRotateOperation,
  RasterSharpenOperation as ImageSharpenOperation,
  RasterTransformOperation as ImageTransformOperation,
} from "@narratage/raster";

/** Authored transformation intent. Operation order is author meaning. */
export type ImageTransformProgram = {
  readonly contract: "svml.image-transform-program@1";
  readonly operations: readonly RasterTransformOperation[];
};
