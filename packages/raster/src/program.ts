import { canonicalize, isResourceId } from "@hypit/protocol";
import { assertCanvasSpace, assertSpatialFrame } from "@hypit/spatial";

import type {
  RasterComposeRequest, RasterEncodeOperation, RasterLayer, RasterRequest,
  RasterTransformOperation, RasterTransformRequest,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function finite(value: number, minimum: number, maximum: number, subject: string): void {
  assert(Number.isFinite(value) && value >= minimum && value <= maximum,
    `${subject} must be between ${minimum} and ${maximum}`);
}
function positiveInteger(value: number, maximum: number, subject: string): void {
  assert(Number.isSafeInteger(value) && value > 0 && value <= maximum,
    `${subject} must be a positive integer no greater than ${maximum}`);
}
function color(value: string | undefined, subject: string, alpha = true): void {
  if (value === undefined) return;
  const pattern = alpha ? /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu : /^#[0-9a-f]{8}$/iu;
  assert(pattern.test(value), `${subject} must be ${alpha ? "#RRGGBB or #RRGGBBAA" : "#RRGGBBAA"}`);
}
function image(value: RasterLayer["source"], subject: string): void {
  assert(value.kind === "blob" && isResourceId(value.resource) && Number.isSafeInteger(value.size)
    && value.size >= 0 && value.mediaType.startsWith("image/"), `${subject} must be an image Blob Artifact`);
}

function assertTransformOperation(operation: RasterTransformOperation, index: number): void {
  const subject = `Raster transform operation ${index + 1}`;
  switch (operation.kind) {
    case "crop":
      if (operation.unit === "fraction") {
        finite(operation.x, 0, 1, `${subject}.x`); finite(operation.y, 0, 1, `${subject}.y`);
        finite(operation.width, Number.EPSILON, 1, `${subject}.width`);
        finite(operation.height, Number.EPSILON, 1, `${subject}.height`);
        assert(operation.x + operation.width <= 1 + 1e-9 && operation.y + operation.height <= 1 + 1e-9,
          `${subject} lies outside the source image`);
      } else {
        assert(operation.unit === "pixel", `${subject}.unit is invalid`);
        assert(Number.isSafeInteger(operation.x) && operation.x >= 0 && Number.isSafeInteger(operation.y) && operation.y >= 0,
          `${subject} pixel origin is invalid`);
        positiveInteger(operation.width, 65_535, `${subject}.width`);
        positiveInteger(operation.height, 65_535, `${subject}.height`);
      }
      return;
    case "resize":
      positiveInteger(operation.width, 16_384, `${subject}.width`);
      positiveInteger(operation.height, 16_384, `${subject}.height`);
      assert(["contain", "cover", "stretch"].includes(operation.fit), `${subject}.fit is invalid`);
      assert(["nearest", "linear", "cubic", "area", "lanczos"].includes(operation.interpolation), `${subject}.interpolation is invalid`);
      color(operation.background, `${subject}.background`); return;
    case "rotate": assert([90, 180, 270].includes(operation.degrees), `${subject}.degrees is invalid`); return;
    case "flip": assert(["horizontal", "vertical", "both"].includes(operation.axis), `${subject}.axis is invalid`); return;
    case "denoise":
      assert(operation.method === "nlm-ycrcb", `${subject}.method is invalid`);
      finite(operation.lumaStrength, 0, 50, `${subject}.lumaStrength`);
      finite(operation.chromaStrength, 0, 50, `${subject}.chromaStrength`);
      positiveInteger(operation.templateWindow, 31, `${subject}.templateWindow`);
      positiveInteger(operation.searchWindow, 63, `${subject}.searchWindow`);
      assert(operation.templateWindow % 2 === 1 && operation.searchWindow % 2 === 1
        && operation.searchWindow > operation.templateWindow, `${subject} NLM windows are invalid`);
      finite(operation.saturationRecovery, 0, 4, `${subject}.saturationRecovery`); return;
    case "color":
      finite(operation.exposureStops, -8, 8, `${subject}.exposureStops`);
      finite(operation.contrast, 0, 4, `${subject}.contrast`); finite(operation.saturation, 0, 4, `${subject}.saturation`);
      finite(operation.temperature, -1, 1, `${subject}.temperature`); finite(operation.tint, -1, 1, `${subject}.tint`);
      finite(operation.gamma, 0.1, 10, `${subject}.gamma`); return;
    case "sharpen":
      finite(operation.amount, 0, 5, `${subject}.amount`); finite(operation.radius, 0.1, 20, `${subject}.radius`);
      finite(operation.threshold, 0, 255, `${subject}.threshold`); return;
    case "blur": finite(operation.sigma, 0.1, 100, `${subject}.sigma`); return;
    case "alpha":
      assert(operation.mode === "preserve" || operation.mode === "flatten", `${subject}.mode is invalid`);
      color(operation.background, `${subject}.background`);
      assert(operation.mode !== "flatten" || operation.background !== undefined, `${subject}.background is required`);
      assert(operation.mode !== "preserve" || operation.background === undefined, `${subject}.background is unused`); return;
    case "encode":
      assert(["png", "jpeg", "webp"].includes(operation.format), `${subject}.format is invalid`);
      if (operation.quality !== undefined) finite(operation.quality, 1, 100, `${subject}.quality`);
      assert(operation.format !== "png" || operation.quality === undefined, `${subject}.quality is not defined for PNG`);
      color(operation.background, `${subject}.background`);
      assert(operation.format === "jpeg" || operation.background === undefined, `${subject}.background is only defined for JPEG`); return;
  }
}

export function assertRasterTransformOperations(operations: readonly RasterTransformOperation[]): void {
  assert(Array.isArray(operations) && operations.length > 0, "Raster transform requires at least one operation");
  operations.forEach(assertTransformOperation);
  const encodes = operations.filter((operation) => operation.kind === "encode");
  assert(encodes.length <= 1, "Raster transform may encode only once");
  assert(encodes.length === 0 || operations.at(-1)?.kind === "encode", "Raster encode must be final");
}

export function assertRasterRequest(value: RasterRequest): void {
  if (value.kind === "transform") {
    image(value.source, "Raster transform source");
    assertRasterTransformOperations(value.operations);
    return;
  }
  assert(value.kind === "compose", "RasterRequest.kind is invalid");
  assertCanvasSpace(value.canvas); color(value.background, "Raster compose background", false);
  assert(value.layers.length > 0 && value.layers.length <= 64, "Raster compose requires one to 64 Layers");
  value.layers.forEach((layer, index) => {
    image(layer.source, `Raster Layer ${index + 1}.source`); assertSpatialFrame(layer.frame);
    assert(["contain", "cover", "stretch"].includes(layer.fit), `Raster Layer ${index + 1}.fit is invalid`);
    assert(["nearest", "linear", "cubic", "area", "lanczos"].includes(layer.interpolation),
      `Raster Layer ${index + 1}.interpolation is invalid`);
    finite(layer.opacity, 0, 1, `Raster Layer ${index + 1}.opacity`);
  });
}

export function rasterTransformRequest(source: RasterTransformRequest["source"], operations: readonly RasterTransformOperation[]): RasterTransformRequest {
  const request = canonicalize({ kind: "transform", source, operations }) as unknown as RasterTransformRequest;
  assertRasterRequest(request); return request;
}
export function rasterComposeRequest(value: Omit<RasterComposeRequest, "kind">): RasterComposeRequest {
  const request = canonicalize({ kind: "compose", ...value }) as unknown as RasterComposeRequest;
  assertRasterRequest(request); return request;
}
export function rasterSources(request: RasterRequest): readonly RasterLayer["source"][] {
  assertRasterRequest(request); return request.kind === "transform" ? [request.source] : request.layers.map((layer) => layer.source);
}
export function rasterOutputMediaType(request: RasterRequest): string {
  assertRasterRequest(request);
  if (request.kind === "compose") return "image/png";
  const encode = request.operations.find((operation): operation is RasterEncodeOperation => operation.kind === "encode");
  return encode?.format === "jpeg" ? "image/jpeg" : encode?.format === "webp" ? "image/webp" : "image/png";
}
