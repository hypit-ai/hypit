import { canonicalize } from "@hypit/hypit/protocol";
import { assertImageTransformOperations } from "./execution.js";

import type { ImageTransformProgram } from "./types.js";

export function verifyImageTransformProgram(program: ImageTransformProgram): void {
  assertImageTransformOperations(program.operations);
}

export function sealImageTransformProgram(program: ImageTransformProgram): ImageTransformProgram {
  const sealed = canonicalize(program) as unknown as ImageTransformProgram;
  verifyImageTransformProgram(sealed);
  return sealed;
}
