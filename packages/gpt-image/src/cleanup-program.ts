import { sealImageTransformProgram } from "@hypit/raster-transform";

/** The package-owned cleanup recipe used by `@hypit/gpt-image/clean@1`. */
export const gptImageCleanupProgram = sealImageTransformProgram({
  operations: [{
    kind: "denoise",
    method: "nlm-ycrcb",
    lumaStrength: 2,
    chromaStrength: 10,
    templateWindow: 7,
    searchWindow: 21,
    saturationRecovery: 1.02,
  }, {
    kind: "encode",
    format: "png",
  }],
});
