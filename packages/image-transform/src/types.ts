import type { BlobRef } from "@narratage/protocol";

export type ImageCropOperation = {
  readonly kind: "crop";
  readonly unit: "fraction" | "pixel";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ImageResizeOperation = {
  readonly kind: "resize";
  readonly width: number;
  readonly height: number;
  readonly fit: "contain" | "cover" | "stretch";
  readonly interpolation: "nearest" | "linear" | "cubic" | "area" | "lanczos";
  readonly background?: string;
};

export type ImageRotateOperation = {
  readonly kind: "rotate";
  readonly degrees: 90 | 180 | 270;
};

export type ImageFlipOperation = {
  readonly kind: "flip";
  readonly axis: "horizontal" | "vertical" | "both";
};

export type ImageDenoiseOperation = {
  readonly kind: "denoise";
  readonly method: "nlm-ycrcb";
  readonly lumaStrength: number;
  readonly chromaStrength: number;
  readonly templateWindow: number;
  readonly searchWindow: number;
  readonly saturationRecovery: number;
};

export type ImageColorOperation = {
  readonly kind: "color";
  readonly exposureStops: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly temperature: number;
  readonly tint: number;
  readonly gamma: number;
};

export type ImageSharpenOperation = {
  readonly kind: "sharpen";
  readonly amount: number;
  readonly radius: number;
  readonly threshold: number;
};

export type ImageBlurOperation = {
  readonly kind: "blur";
  readonly sigma: number;
};

export type ImageAlphaOperation = {
  readonly kind: "alpha";
  readonly mode: "preserve" | "flatten";
  readonly background?: string;
};

export type ImageEncodeOperation = {
  readonly kind: "encode";
  readonly format: "png" | "jpeg" | "webp";
  readonly quality?: number;
  readonly background?: string;
};

export type ImageTransformOperation =
  | ImageCropOperation
  | ImageResizeOperation
  | ImageRotateOperation
  | ImageFlipOperation
  | ImageDenoiseOperation
  | ImageColorOperation
  | ImageSharpenOperation
  | ImageBlurOperation
  | ImageAlphaOperation
  | ImageEncodeOperation;

/** Authored transformation intent. Operation order is author meaning. */
export type ImageTransformProgram = {
  readonly contract: "svml.image-transform-program@1";
  readonly operations: readonly ImageTransformOperation[];
};

/** Execution request. The accepted output is the BlobArtifact itself, not an envelope. */
export type ImageTransformRequest = {
  readonly contract: "svml.image-transform-request@1";
  readonly source: BlobRef;
  readonly program: ImageTransformProgram;
};
