import {
  assertCompositableSurfaceRef,
  verifySynchronizedMedia,
} from "@hypit/media";
import type { CompositableSurfaceRef, SynchronizedMedia } from "@hypit/media";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { BlobRef } from "@hypit/hypit/protocol";
import {
  assertContentFit,
  assertIntrinsicExtent,
  assertSpatialMap2D,
} from "@hypit/spatial";
import type { ContentFit, IntrinsicExtent, SpatialMap2D } from "@hypit/spatial";

import type {
  MediaGradientStop,
  MediaLayer,
  MediaLayerSet,
  MediaPaint,
  MediaPaintLayerSpec,
  MediaSampleLayer,
  MediaSampleLayerSpec,
  MediaSamplingMotion,
  MediaVisualSource,
} from "./types.js";
import { assertVisualSourceTimeSpec, defaultVisualSourceTimeSpec } from "./source-time.js";

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

export function assertMediaVisualSource(value: MediaVisualSource, label: string): void {
  assertIntrinsicExtent(value.extent);
  if (value.kind === "still") {
    assertBlob(value.artifact, `${label}.artifact`, "image/");
    return;
  }
  if (value.kind === "surface") {
    assertCompositableSurfaceRef(value.surface, `${label}.surface`);
    assert(value.extent.widthPx === value.surface.width && value.extent.heightPx === value.surface.height,
      `${label} Surface extent disagrees with its intrinsic dimensions.`);
    return;
  }
  assert(value.kind === "timed", `${label}.kind is unsupported.`);
  assertBlob(value.artifact, `${label}.artifact`, "video/");
  assert(Number.isSafeInteger(value.frameRate.numerator) && value.frameRate.numerator > 0
    && Number.isSafeInteger(value.frameRate.denominator) && value.frameRate.denominator > 0
    && Number.isSafeInteger(value.frameCount) && value.frameCount > 0, `${label} timing is invalid.`);
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
  if (value.sourceTime !== undefined) assertVisualSourceTimeSpec(value.sourceTime, "MediaSampleLayerSpec.sourceTime");
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
    assertMediaVisualSource(layer.source, `Media layer ${layer.id}.source`);
    if (layer.placement.kind === "fit") assertContentFit(layer.placement.fit);
    else if (layer.placement.kind === "mapping") assertSpatialMap2D(layer.placement.mapping);
    else assert(false, `Media layer ${layer.id} placement is unsupported.`);
    if (layer.source.kind === "still") {
      assert(layer.sourceTime === undefined, `Still Media layer ${layer.id} cannot have source time.`);
    } else {
      const frames = layer.source.kind === "timed"
        ? layer.source.frameCount
        : layer.source.surface.timing.kind === "frames" ? layer.source.surface.timing.frameCount : undefined;
      if (frames === undefined) {
        assert(layer.sourceTime === undefined, `Still Surface layer ${layer.id} cannot have source time.`);
      } else {
        assert(layer.sourceTime !== undefined, `Timed Media layer ${layer.id} requires source time.`);
        if (layer.sourceTime.kind === "spec") assertVisualSourceTimeSpec(layer.sourceTime.value, `Media layer ${layer.id}.sourceTime`);
      }
    }
    assertMediaSampleLayerSpec({
      id: layer.id,
      ...(layer.sourceTime?.kind !== "spec" ? {} : { sourceTime: layer.sourceTime.value }),
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
  source: MediaVisualSource,
  placement: MediaSampleLayer["placement"],
  spec: MediaSampleLayerSpec,
): MediaSampleLayer {
  assertMediaVisualSource(source, "Media sample source");
  if (placement.kind === "fit") assertContentFit(placement.fit);
  else assertSpatialMap2D(placement.mapping);
  assertMediaSampleLayerSpec(spec);
  const layer: MediaSampleLayer = {
    id: spec.id,
    kind: "sample",
    source: structuredClone(source),
    placement: structuredClone(placement),
    ...(spec.sourceTime === undefined ? {} : { sourceTime: { kind: "spec", value: structuredClone(spec.sourceTime) } as const }),
    appearance: structuredClone(spec.appearance),
    ...(spec.samplingMotion === undefined ? {} : { samplingMotion: structuredClone(spec.samplingMotion) }),
  };
  return layer;
}

export function appendStillMediaLayer(
  set: MediaLayerSet,
  source: BlobRef,
  extent: IntrinsicExtent,
  fit: ContentFit,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  assertBlob(source, "Still Media source", "image/");
  assertIntrinsicExtent(extent);
  assert(spec.sourceTime === undefined, "Still Media source cannot have source time.");
  return append(set, sampleLayer(
    { kind: "still", artifact: structuredClone(source), extent: { ...extent } },
    { kind: "fit", fit: structuredClone(fit) }, spec,
  ));
}

export function appendMappedStillMediaLayer(
  set: MediaLayerSet,
  source: BlobRef,
  extent: IntrinsicExtent,
  mapping: SpatialMap2D,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  assertBlob(source, "Still Media source", "image/");
  assertIntrinsicExtent(extent);
  assertSpatialMap2D(mapping);
  assert(spec.sourceTime === undefined, "Still Media source cannot have source time.");
  return append(set, sampleLayer(
    { kind: "still", artifact: structuredClone(source), extent: { ...extent } },
    { kind: "mapping", mapping: structuredClone(mapping) }, spec,
  ));
}

export function appendTimedMediaLayer(
  set: MediaLayerSet,
  media: SynchronizedMedia,
  fit: ContentFit,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  verifySynchronizedMedia(media);
  assert(media.visual !== undefined, "Timed Media source has no normalized visual member.");
  const source: MediaVisualSource = {
    kind: "timed",
    artifact: structuredClone(media.visual.artifact),
    extent: {
      widthPx: media.visual.width,
      heightPx: media.visual.height,
    },
    frameRate: { ...media.frameDomain.frameRate },
    frameCount: media.frameDomain.frameCount,
  };
  return append(set, sampleLayer(source, { kind: "fit", fit: structuredClone(fit) }, {
    ...spec,
    sourceTime: spec.sourceTime ?? defaultVisualSourceTimeSpec(),
  }));
}

export function appendMappedTimedMediaLayer(
  set: MediaLayerSet,
  media: SynchronizedMedia,
  mapping: SpatialMap2D,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  verifySynchronizedMedia(media);
  assert(media.visual !== undefined, "Timed Media source has no normalized visual member.");
  assertSpatialMap2D(mapping);
  const source: MediaVisualSource = {
    kind: "timed",
    artifact: structuredClone(media.visual.artifact),
    extent: { widthPx: media.visual.width, heightPx: media.visual.height },
    frameRate: { ...media.frameDomain.frameRate },
    frameCount: media.frameDomain.frameCount,
  };
  return append(set, sampleLayer(source, { kind: "mapping", mapping: structuredClone(mapping) }, {
    ...spec,
    sourceTime: spec.sourceTime ?? defaultVisualSourceTimeSpec(),
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
    effectiveSpec = spec.sourceTime === undefined
      ? sealMediaSampleLayerSpec({ ...spec, sourceTime: defaultVisualSourceTimeSpec() })
      : spec;
  } else {
    assert(spec.sourceTime === undefined, "Still Media Surface cannot have source time.");
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
    effectiveSpec = spec.sourceTime === undefined
      ? sealMediaSampleLayerSpec({ ...spec, sourceTime: defaultVisualSourceTimeSpec() })
      : spec;
  } else {
    assert(spec.sourceTime === undefined, "Still Media Surface cannot have source time.");
  }
  return append(set, sampleLayer({
    kind: "surface",
    surface: structuredClone(surface),
    extent: { widthPx: surface.width, heightPx: surface.height },
  }, { kind: "mapping", mapping: structuredClone(mapping) }, effectiveSpec));
}
