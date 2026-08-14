import { canonicalize } from "@narratage/protocol";
import { assertRasterTransformOperations } from "@narratage/raster";

import type { ImageTransformProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

export function verifyImageTransformProgram(program: ImageTransformProgram): void {
  assertRasterTransformOperations(program.operations);
}

export function sealImageTransformProgram(program: ImageTransformProgram): ImageTransformProgram {
  const sealed = canonicalize(program) as unknown as ImageTransformProgram;
  verifyImageTransformProgram(sealed);
  return sealed;
}

export const gptImageDenoiseV1 = sealImageTransformProgram({
  operations: [{
    kind: "denoise", method: "nlm-ycrcb", lumaStrength: 2, chromaStrength: 10,
    templateWindow: 7, searchWindow: 21, saturationRecovery: 1.02,
  }, { kind: "encode", format: "png" }],
});
