import { canonicalize } from "@svml/protocol";

import type {
  ImageTransformOperation,
  ImageTransformProgram,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finite(value: number, minimum: number, maximum: number, subject: string): void {
  assert(Number.isFinite(value) && value >= minimum && value <= maximum,
    `${subject} must be between ${minimum} and ${maximum}`);
}

function positiveInteger(value: number, maximum: number, subject: string): void {
  assert(Number.isSafeInteger(value) && value > 0 && value <= maximum,
    `${subject} must be a positive integer no greater than ${maximum}`);
}

function color(value: string | undefined, subject: string): void {
  if (value === undefined) return;
  assert(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${subject} must be #RRGGBB or #RRGGBBAA`);
}

function verifyOperation(operation: ImageTransformOperation, index: number): void {
  const subject = `ImageTransform operation ${index + 1}`;
  switch (operation.kind) {
    case "crop": {
      if (operation.unit === "fraction") {
        finite(operation.x, 0, 1, `${subject}.x`);
        finite(operation.y, 0, 1, `${subject}.y`);
        finite(operation.width, Number.EPSILON, 1, `${subject}.width`);
        finite(operation.height, Number.EPSILON, 1, `${subject}.height`);
        assert(operation.x + operation.width <= 1 + 1e-9 && operation.y + operation.height <= 1 + 1e-9,
          `${subject} lies outside the source image`);
      } else {
        assert(operation.unit === "pixel", `${subject}.unit is invalid`);
        assert(Number.isSafeInteger(operation.x) && operation.x >= 0
          && Number.isSafeInteger(operation.y) && operation.y >= 0,
        `${subject} pixel origin is invalid`);
        positiveInteger(operation.width, 65_535, `${subject}.width`);
        positiveInteger(operation.height, 65_535, `${subject}.height`);
      }
      return;
    }
    case "resize":
      positiveInteger(operation.width, 16_384, `${subject}.width`);
      positiveInteger(operation.height, 16_384, `${subject}.height`);
      assert(["contain", "cover", "stretch"].includes(operation.fit), `${subject}.fit is invalid`);
      assert(["nearest", "linear", "cubic", "area", "lanczos"].includes(operation.interpolation),
        `${subject}.interpolation is invalid`);
      color(operation.background, `${subject}.background`);
      return;
    case "rotate":
      assert([90, 180, 270].includes(operation.degrees), `${subject}.degrees is invalid`);
      return;
    case "flip":
      assert(["horizontal", "vertical", "both"].includes(operation.axis), `${subject}.axis is invalid`);
      return;
    case "denoise":
      assert(operation.method === "nlm-ycrcb", `${subject}.method is invalid`);
      finite(operation.lumaStrength, 0, 50, `${subject}.lumaStrength`);
      finite(operation.chromaStrength, 0, 50, `${subject}.chromaStrength`);
      positiveInteger(operation.templateWindow, 31, `${subject}.templateWindow`);
      positiveInteger(operation.searchWindow, 63, `${subject}.searchWindow`);
      assert(operation.templateWindow % 2 === 1 && operation.searchWindow % 2 === 1
        && operation.searchWindow > operation.templateWindow,
      `${subject} NLM windows must be odd and searchWindow must be larger`);
      finite(operation.saturationRecovery, 0, 4, `${subject}.saturationRecovery`);
      return;
    case "color":
      finite(operation.exposureStops, -8, 8, `${subject}.exposureStops`);
      finite(operation.contrast, 0, 4, `${subject}.contrast`);
      finite(operation.saturation, 0, 4, `${subject}.saturation`);
      finite(operation.temperature, -1, 1, `${subject}.temperature`);
      finite(operation.tint, -1, 1, `${subject}.tint`);
      finite(operation.gamma, 0.1, 10, `${subject}.gamma`);
      return;
    case "sharpen":
      finite(operation.amount, 0, 5, `${subject}.amount`);
      finite(operation.radius, 0.1, 20, `${subject}.radius`);
      finite(operation.threshold, 0, 255, `${subject}.threshold`);
      return;
    case "blur":
      finite(operation.sigma, 0.1, 100, `${subject}.sigma`);
      return;
    case "alpha":
      assert(operation.mode === "preserve" || operation.mode === "flatten", `${subject}.mode is invalid`);
      color(operation.background, `${subject}.background`);
      assert(operation.mode !== "flatten" || operation.background !== undefined,
        `${subject}.background is required when flattening alpha`);
      assert(operation.mode !== "preserve" || operation.background === undefined,
        `${subject}.background is unused when preserving alpha`);
      return;
    case "encode":
      assert(["png", "jpeg", "webp"].includes(operation.format), `${subject}.format is invalid`);
      if (operation.quality !== undefined) finite(operation.quality, 1, 100, `${subject}.quality`);
      assert(operation.format !== "png" || operation.quality === undefined,
        `${subject}.quality is not defined for PNG`);
      color(operation.background, `${subject}.background`);
      assert(operation.format === "jpeg" || operation.background === undefined,
        `${subject}.background is only defined for JPEG alpha flattening`);
      return;
  }
}

export function verifyImageTransformProgram(program: ImageTransformProgram): void {
  assert(program.contract === "svml.image-transform-program@1", "Unsupported ImageTransformProgram contract");
  assert(program.operations.length > 0, "ImageTransformProgram requires at least one operation");
  program.operations.forEach(verifyOperation);
  const encodes = program.operations.filter((operation) => operation.kind === "encode");
  assert(encodes.length <= 1, "ImageTransformProgram may encode only once");
  assert(encodes.length === 0 || program.operations.at(-1)?.kind === "encode",
    "ImageTransform encode must be the final operation");
}

export function sealImageTransformProgram(program: ImageTransformProgram): ImageTransformProgram {
  const sealed = canonicalize(program) as unknown as ImageTransformProgram;
  verifyImageTransformProgram(sealed);
  return sealed;
}

export const gptImageDenoiseV1 = sealImageTransformProgram({
  contract: "svml.image-transform-program@1",
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
