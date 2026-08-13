import { assertSpatialFrame } from "@narratage/spatial";
import { canonicalize, isDigest } from "@narratage/protocol";

import type {
  ImageComposeLayer,
  ImageComposeLayerSet,
  ImageComposeLayerSpec,
  ImageComposeOptions,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function color(value: string, label: string): void {
  assert(/^#[0-9a-f]{8}$/iu.test(value), `${label} must be #RRGGBBAA.`);
}

export function assertImageComposeOptions(value: ImageComposeOptions): void {
  color(value.background, "ImageComposeOptions.background");
}

export function sealImageComposeOptions(value: ImageComposeOptions): ImageComposeOptions {
  assertImageComposeOptions(value);
  return canonicalize(value) as unknown as ImageComposeOptions;
}

export function assertImageComposeLayerSpec(value: ImageComposeLayerSpec): void {
  assert(["contain", "cover", "stretch"].includes(value.fit), "ImageComposeLayerSpec.fit is invalid.");
  assert(["nearest", "linear", "cubic", "area", "lanczos"].includes(value.interpolation),
    "ImageComposeLayerSpec.interpolation is invalid.");
  assert(Number.isFinite(value.opacity) && value.opacity >= 0 && value.opacity <= 1,
    "ImageComposeLayerSpec.opacity must be between zero and one.");
}

export function sealImageComposeLayerSpec(value: ImageComposeLayerSpec): ImageComposeLayerSpec {
  assertImageComposeLayerSpec(value);
  return canonicalize(value) as unknown as ImageComposeLayerSpec;
}

function assertLayer(value: ImageComposeLayer, label: string): void {
  assert(value.source.kind === "blob" && isDigest(value.source.digest)
    && Number.isSafeInteger(value.source.size) && value.source.size >= 0
    && value.source.mediaType.startsWith("image/"), `${label}.source must be an image BlobArtifact.`);
  assertSpatialFrame(value.frame);
  assertImageComposeLayerSpec(value.spec);
}

export function createImageComposeLayerSet(): ImageComposeLayerSet {
  return { layers: [] };
}

export function assertImageComposeLayerSet(value: ImageComposeLayerSet): void {
  assert(Array.isArray(value.layers),
    "ImageComposeLayerSet is invalid.");
  assert(value.layers.length <= 64, "ImageComposeLayerSet exceeds 64 Layers.");
  value.layers.forEach((layer, index) => {
    assertLayer(layer, `ImageComposeLayerSet.layers.${index + 1}`);
  });
}

export function appendImageComposeLayer(
  set: ImageComposeLayerSet,
  source: ImageComposeLayer["source"],
  frame: ImageComposeLayer["frame"],
  spec: ImageComposeLayerSpec,
): ImageComposeLayerSet {
  assertImageComposeLayerSet(set);
  const next: ImageComposeLayerSet = {

    layers: [...set.layers, { source: structuredClone(source), frame: structuredClone(frame), spec: structuredClone(spec) }],
  };
  assertImageComposeLayerSet(next);
  return canonicalize(next) as unknown as ImageComposeLayerSet;
}
