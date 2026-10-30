import {
  assertCompositableSurfaceRef,
  preparedVisualExtent,
  verifyPictureInterpretation,
  verifyPreparedMedia,
} from "@hypit/media";
import type { CompositableSurfaceRef, PictureInterpretation, PreparedMedia } from "@hypit/media";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";
import {
  assertContentFit,
  assertIntrinsicExtent,
  assertSpatialMap2D,
} from "@hypit/spatial";
import type { ContentFit, IntrinsicExtent, SpatialMap2D } from "@hypit/spatial";
import { assertTemporalMap, assertTemporalRelationSpec, defaultTemporalRelationSpec } from "@hypit/temporal";
import type { TemporalMap } from "@hypit/temporal";

import type {
  MediaGradientStop,
  MediaLayer,
  MediaLayerSet,
  MediaPaint,
  MediaPaintLayerSpec,
  MediaSampleLayer,
  MediaSampleLayerSpec,
  MediaSamplingMotion,
  VisualSource,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertMediaIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertBlob(value: BlobRef, label: string, prefix?: string): void {
  assertBlobRef(value, label);
  if (prefix !== undefined) assert(value.mediaType.startsWith(prefix), `${label} must be ${prefix} bytes.`);
}

function finite(value: number, label: string): void {
  assert(Number.isFinite(value), `${label} must be finite.`);
}

function unit(value: number, label: string): void {
  finite(value, label);
  assert(value >= 0 && value <= 1, `${label} must be inside [0, 1].`);
}

function assertColor(value: string, label: string): void {
  assert(typeof value === "string" && value.trim().length > 0 && !/[;{}]/u.test(value), `${label} is invalid.`);
}

function assertStops(stops: readonly MediaGradientStop[], label: string): void {
  assert(stops.length >= 2, `${label} needs at least two stops.`);
  let previous = -1;
  for (const [index, stop] of stops.entries()) {
    unit(stop.offset, `${label}.${index}.offset`);
    assert(stop.offset > previous, `${label} offsets must be strictly increasing.`);
    assertColor(stop.color, `${label}.${index}.color`);
    previous = stop.offset;
  }
}

export function assertMediaPaint(value: MediaPaint, label: string): void {
  if (value.kind === "solid") {
    assertColor(value.color, `${label}.color`);
    return;
  }
  assertStops(value.stops, `${label}.stops`);
  if (value.kind === "linear-gradient") {
    finite(value.angleDeg, `${label}.angleDeg`);
    return;
  }
  assert(value.kind === "radial-gradient", `${label}.kind is unsupported.`);
  unit(value.center.x, `${label}.center.x`);
  unit(value.center.y, `${label}.center.y`);
}

export function assertMediaSamplingMotion(value: MediaSamplingMotion, label: string): void {
  assert(value.keyframes.length >= 2, `${label} needs at least two keyframes.`);
  let previous = -1;
  for (const [index, keyframe] of value.keyframes.entries()) {
    finite(keyframe.atProgress, `${label}.${index}.atProgress`);
    assert(keyframe.atProgress >= 0 && keyframe.atProgress <= 1 && keyframe.atProgress > previous,
      `${label}.${index}.atProgress is invalid.`);
    finite(keyframe.zoom, `${label}.${index}.zoom`);
    assert(keyframe.zoom > 0 && keyframe.zoom <= 100, `${label}.${index}.zoom is invalid.`);
    finite(keyframe.offsetX, `${label}.${index}.offsetX`);
    finite(keyframe.offsetY, `${label}.${index}.offsetY`);
    finite(keyframe.rotationDeg, `${label}.${index}.rotationDeg`);
    if (keyframe.easing !== undefined) {
      assert(["linear", "ease-in", "ease-out", "ease-in-out"].includes(keyframe.easing),
        `${label}.${index}.easing is invalid.`);
    }
    previous = keyframe.atProgress;
  }
  assert(value.keyframes[0]!.atProgress === 0 && value.keyframes.at(-1)!.atProgress === 1,
    `${label} must cover normalized progress [0, 1].`);
}

export function assertVisualSource(value: VisualSource, label: string): void {
  assertIntrinsicExtent(value.extent);
  if (value.kind === "still") {
    assertBlob(value.artifact, `${label}.artifact`, "image/");
    verifyPictureInterpretation(value.picture, `${label}.picture`);
    return;
  }
  if (value.kind === "surface") {
    assertCompositableSurfaceRef(value.surface, `${label}.surface`);
    assert(value.extent.widthPx === value.surface.width && value.extent.heightPx === value.surface.height,
      `${label} Surface extent disagrees with its intrinsic dimensions.`);
    return;
  }
  assert(value.kind === "timed", `${label}.kind is unsupported.`);
  verifyPreparedMedia(value.media);
  assert(value.media.visual !== undefined, `${label}.media has no visual member.`);
  const expected = preparedVisualExtent(value.media);
  assert(value.extent.widthPx === expected.widthPx && value.extent.heightPx === expected.heightPx,
    `${label} extent disagrees with its prepared visual interpretation.`);
}

export function assertMediaSampleLayerSpec(value: MediaSampleLayerSpec): void {
  assertMediaIdentity(value.id, "MediaSampleLayerSpec.id");
  unit(value.appearance.opacity, "MediaSampleLayerSpec.appearance.opacity");
  const filter = value.appearance.filter;
  finite(filter.blurPx, "MediaSampleLayerSpec.filter.blurPx");
  finite(filter.brightness, "MediaSampleLayerSpec.filter.brightness");
  finite(filter.contrast, "MediaSampleLayerSpec.filter.contrast");
  finite(filter.saturation, "MediaSampleLayerSpec.filter.saturation");
  assert(filter.blurPx >= 0 && filter.brightness >= 0 && filter.contrast >= 0 && filter.saturation >= 0,
    "MediaSampleLayerSpec filter values must be non-negative.");
  if (value.sampling !== undefined) assertTemporalRelationSpec(value.sampling, "MediaSampleLayerSpec.sampling");
  if (value.samplingMotion !== undefined) assertMediaSamplingMotion(value.samplingMotion, "MediaSampleLayerSpec.samplingMotion");
}

export function sealMediaSampleLayerSpec(value: MediaSampleLayerSpec): MediaSampleLayerSpec {
  assertMediaSampleLayerSpec(value);
  return canonicalize(value) as unknown as MediaSampleLayerSpec;
}

export function assertMediaPaintLayerSpec(value: MediaPaintLayerSpec): void {
  assertMediaIdentity(value.id, "MediaPaintLayerSpec.id");
  assertMediaPaint(value.paint, "MediaPaintLayerSpec.paint");
  unit(value.opacity, "MediaPaintLayerSpec.opacity");
}

export function sealMediaPaintLayerSpec(value: MediaPaintLayerSpec): MediaPaintLayerSpec {
  assertMediaPaintLayerSpec(value);
  return canonicalize(value) as unknown as MediaPaintLayerSpec;
}

export function createMediaLayerSet(): MediaLayerSet {
  return { layers: [] };
}

export function assertMediaLayerSet(value: MediaLayerSet): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.layers), "MediaLayerSet is invalid.");
  const ids = new Set<string>();
  for (const layer of value.layers) {
    assert(layer !== null && typeof layer === "object" && !Array.isArray(layer), "Media layer is invalid.");
    assertMediaIdentity(layer.id, "Media layer id");
    assert(!ids.has(layer.id), `MediaLayerSet repeats layer ${layer.id}.`);
    ids.add(layer.id);
    if (layer.kind === "paint") {
      assertMediaPaint(layer.paint, `Media layer ${layer.id}.paint`);
      unit(layer.opacity, `Media layer ${layer.id}.opacity`);
      continue;
    }
    assert(layer.kind === "sample", `Media layer ${layer.id} kind is unsupported.`);
    assertVisualSource(layer.source, `Media layer ${layer.id}.source`);
    if (layer.placement.kind === "fit") assertContentFit(layer.placement.fit);
    else if (layer.placement.kind === "mapping") assertSpatialMap2D(layer.placement.mapping);
    else assert(false, `Media layer ${layer.id} placement is unsupported.`);
    if (layer.source.kind === "still") {
      assert(layer.sampling === undefined, `Still Media layer ${layer.id} cannot have temporal sampling.`);
    } else {
      const timed = layer.source.kind === "timed"
        || layer.source.kind === "surface" && layer.source.surface.timing.kind === "frames";
      if (!timed) {
        assert(layer.sampling === undefined, `Still Surface layer ${layer.id} cannot have temporal sampling.`);
      } else {
        assert(layer.sampling !== undefined, `Timed Media layer ${layer.id} requires temporal sampling.`);
        if (layer.sampling.kind === "relation") assertTemporalRelationSpec(layer.sampling.value, `Media layer ${layer.id}.sampling`);
        else assertTemporalMap(layer.sampling.value);
      }
    }
    assertMediaSampleLayerSpec({
      id: layer.id,
      ...(layer.sampling?.kind !== "relation" ? {} : { sampling: layer.sampling.value }),
      appearance: layer.appearance,
      ...(layer.samplingMotion === undefined ? {} : { samplingMotion: layer.samplingMotion }),
    });
  }
}

function append(set: MediaLayerSet, layer: MediaLayer): MediaLayerSet {
  assertMediaLayerSet(set);
  assert(!set.layers.some((item) => item.id === layer.id), `MediaLayerSet already contains ${layer.id}.`);
  const result = { layers: [...set.layers, layer] };
  assertMediaLayerSet(result);
  return canonicalize(result) as unknown as MediaLayerSet;
}

export function appendMediaPaintLayer(set: MediaLayerSet, spec: MediaPaintLayerSpec): MediaLayerSet {
  assertMediaPaintLayerSpec(spec);
  return append(set, { id: spec.id, kind: "paint", paint: structuredClone(spec.paint), opacity: spec.opacity });
}

function sampleLayer(
  source: VisualSource,
  placement: MediaSampleLayer["placement"],
  spec: MediaSampleLayerSpec,
): MediaSampleLayer {
  assertVisualSource(source, "Media sample source");
  if (placement.kind === "fit") assertContentFit(placement.fit);
  else assertSpatialMap2D(placement.mapping);
  assertMediaSampleLayerSpec(spec);
  const layer: MediaSampleLayer = {
    id: spec.id,
    kind: "sample",
    source: structuredClone(source),
    placement: structuredClone(placement),
    ...(spec.sampling === undefined ? {} : { sampling: { kind: "relation", value: structuredClone(spec.sampling) } as const }),
    appearance: structuredClone(spec.appearance),
    ...(spec.samplingMotion === undefined ? {} : { samplingMotion: structuredClone(spec.samplingMotion) }),
  };
  return layer;
}

export function appendStillMediaLayer(
  set: MediaLayerSet,
  source: BlobRef,
  picture: PictureInterpretation,
  extent: IntrinsicExtent,
  fit: ContentFit,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  assertBlob(source, "Still Media source", "image/");
  verifyPictureInterpretation(picture, "Still Media picture");
  assertIntrinsicExtent(extent);
  assert(spec.sampling === undefined, "Still Media source cannot have temporal sampling.");
  return append(set, sampleLayer(
    { kind: "still", artifact: structuredClone(source), picture: structuredClone(picture), extent: { ...extent } },
    { kind: "fit", fit: structuredClone(fit) }, spec,
  ));
}

export function appendMappedStillMediaLayer(
  set: MediaLayerSet,
  source: BlobRef,
  picture: PictureInterpretation,
  extent: IntrinsicExtent,
  mapping: SpatialMap2D,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  assertBlob(source, "Still Media source", "image/");
  verifyPictureInterpretation(picture, "Still Media picture");
  assertIntrinsicExtent(extent);
  assertSpatialMap2D(mapping);
  assert(spec.sampling === undefined, "Still Media source cannot have temporal sampling.");
  return append(set, sampleLayer(
    { kind: "still", artifact: structuredClone(source), picture: structuredClone(picture), extent: { ...extent } },
    { kind: "mapping", mapping: structuredClone(mapping) }, spec,
  ));
}

export function appendTimedMediaLayer(
  set: MediaLayerSet,
  media: PreparedMedia,
  fit: ContentFit,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  verifyPreparedMedia(media);
  assert(media.visual !== undefined, "Prepared Media source has no visual member.");
  const source: VisualSource = {
    kind: "timed",
    media: structuredClone(media),
    extent: preparedVisualExtent(media),
  };
  return append(set, sampleLayer(source, { kind: "fit", fit: structuredClone(fit) }, {
    ...spec,
    sampling: spec.sampling ?? defaultTemporalRelationSpec(),
  }));
}

export function appendMappedTimedMediaLayer(
  set: MediaLayerSet,
  media: PreparedMedia,
  mapping: SpatialMap2D,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  verifyPreparedMedia(media);
  assert(media.visual !== undefined, "Prepared Media source has no visual member.");
  assertSpatialMap2D(mapping);
  const source: VisualSource = {
    kind: "timed",
    media: structuredClone(media),
    extent: preparedVisualExtent(media),
  };
  return append(set, sampleLayer(source, { kind: "mapping", mapping: structuredClone(mapping) }, {
    ...spec,
    sampling: spec.sampling ?? defaultTemporalRelationSpec(),
  }));
}

export function appendSurfaceMediaLayer(
  set: MediaLayerSet,
  surface: CompositableSurfaceRef,
  fit: ContentFit,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  assertCompositableSurfaceRef(surface);
  let effectiveSpec = spec;
  if (surface.timing.kind === "frames") {
    effectiveSpec = spec.sampling === undefined
      ? sealMediaSampleLayerSpec({ ...spec, sampling: defaultTemporalRelationSpec() })
      : spec;
  } else {
    assert(spec.sampling === undefined, "Still Media Surface cannot have temporal sampling.");
  }
  return append(set, sampleLayer({
    kind: "surface",
    surface: structuredClone(surface),
    extent: { widthPx: surface.width, heightPx: surface.height },
  }, { kind: "fit", fit: structuredClone(fit) }, effectiveSpec));
}

export function appendMappedSurfaceMediaLayer(
  set: MediaLayerSet,
  surface: CompositableSurfaceRef,
  mapping: SpatialMap2D,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  assertCompositableSurfaceRef(surface);
  assertSpatialMap2D(mapping);
  let effectiveSpec = spec;
  if (surface.timing.kind === "frames") {
    effectiveSpec = spec.sampling === undefined
      ? sealMediaSampleLayerSpec({ ...spec, sampling: defaultTemporalRelationSpec() })
      : spec;
  } else {
    assert(spec.sampling === undefined, "Still Media Surface cannot have temporal sampling.");
  }
  return append(set, sampleLayer({
    kind: "surface",
    surface: structuredClone(surface),
    extent: { widthPx: surface.width, heightPx: surface.height },
  }, { kind: "mapping", mapping: structuredClone(mapping) }, effectiveSpec));
}
