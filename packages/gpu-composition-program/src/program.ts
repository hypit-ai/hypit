import { verifyPreparedPictureSampling } from "@hypit/media";
import {
  assertLocalSpatialDomain,
  assertSpatialMap,
  sameSpatialDomain,
} from "@hypit/spatial/algebra";
import { assertExactTemporalValue, assertTemporalSamplingGrid } from "@hypit/temporal";

import type { GpuCompositionProgram } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pictureExtent(value: GpuCompositionProgram["inputs"][number]["picture"]["source"]) {
  const picture = value.interpretation;
  let width = picture.codedWidth * picture.sampleAspectRatio.numerator
    / picture.sampleAspectRatio.denominator;
  let height = picture.codedHeight;
  if (picture.rotationDegrees === 90 || picture.rotationDegrees === 270) [width, height] = [height, width];
  return { width, height };
}

export function assertGpuCompositionProgram(value: GpuCompositionProgram): void {
  assertTemporalSamplingGrid(value.sampling);
  assert(Number.isSafeInteger(value.frameCount) && value.frameCount > 0,
    "GPU Composition frame count must be a positive safe integer.");
  assert(Number.isSafeInteger(value.canvas.width) && value.canvas.width > 0
    && Number.isSafeInteger(value.canvas.height) && value.canvas.height > 0,
  "GPU Composition Canvas must have positive integer dimensions.");
  assert(value.canvas.clearColor.length > 0, "GPU Composition Canvas clear colour is empty.");
  assertLocalSpatialDomain(value.canvas.space);
  assert(value.canvas.space.region.x === 0 && value.canvas.space.region.y === 0
    && value.canvas.space.region.width === value.canvas.width
    && value.canvas.space.region.height === value.canvas.height,
  "GPU Composition Canvas Space differs from its pixel extent.");

  const inputs = new Map<string, GpuCompositionProgram["inputs"][number]>();
  for (const input of value.inputs) {
    assert(input.id.length > 0 && !inputs.has(input.id),
      `GPU Composition input ${input.id} is empty or repeated.`);
    assert(input.source.length > 0 && input.output.length > 0,
      `GPU Composition input ${input.id} has no Source identity.`);
    assertLocalSpatialDomain(input.space);
    verifyPreparedPictureSampling(input.picture);
    const extent = pictureExtent(input.picture.source);
    assert(input.space.region.width === extent.width && input.space.region.height === extent.height,
    `GPU Composition input ${input.id} Space differs from its Picture extent.`);
    inputs.set(input.id, input);
  }
  const layers = new Set<string>();
  for (const layer of value.layers) {
    assert(layer.id.length > 0 && !layers.has(layer.id),
      `GPU Composition layer ${layer.id} is empty or repeated.`);
    layers.add(layer.id);
    const input = inputs.get(layer.input);
    assert(input !== undefined, `GPU Composition layer ${layer.id} has no input ${layer.input}.`);
    assert(layer.samples.length === value.frameCount,
      `GPU Composition layer ${layer.id} does not cover the output frame grid.`);
    for (const sample of layer.samples) {
      if (sample === null) continue;
      assertExactTemporalValue(sample.at, `GPU Composition layer ${layer.id} sample`);
      assert(sample.side === "before" || sample.side === "after",
        `GPU Composition layer ${layer.id} sample side is invalid.`);
      assertSpatialMap(sample.mapping);
      assert(sameSpatialDomain(sample.mapping.target, value.canvas.space),
        `GPU Composition layer ${layer.id} does not sample from the Canvas Space.`);
      assert(sameSpatialDomain(sample.mapping.source, input.space),
        `GPU Composition layer ${layer.id} does not sample its input Space.`);
    }
  }
}

export function sealGpuCompositionProgram(value: GpuCompositionProgram): GpuCompositionProgram {
  assertGpuCompositionProgram(value);
  return structuredClone(value);
}
