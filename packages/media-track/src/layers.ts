import {
  assertCompositableSurfaceRef,
  synchronizedMediaSampleFrames,
  verifySynchronizedMedia,
} from "@hypit/media";
import type { CompositableSurfaceRef, SynchronizedMedia } from "@hypit/media";
import { canonicalize, isDigest } from "@hypit/protocol";
import type { BlobRef } from "@hypit/protocol";
import {
  assertContentFit,
  assertIntrinsicExtent,
} from "@hypit/spatial";
import type { ContentFit, IntrinsicExtent } from "@hypit/spatial";

import type {
  MediaGradientStop,
  MediaLayerProgram,
  MediaLayerSet,
  MediaPaint,
  MediaPaintLayerSpec,
  MediaSampleLayerProgram,
  MediaSampleLayerSpec,
  MediaSamplingMotion,
  MediaVisualOccupancy,
  MediaVisualSource,
  MediaVisualTrim,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertMediaIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function assertBlob(value: BlobRef, label: string, prefix?: string): void {
  assert(value.kind === "blob" && isDigest(value.digest)
    && Number.isSafeInteger(value.size) && value.size >= 0 && value.mediaType.length > 0,
  `${label} is not a valid BlobArtifact.`);
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

export function assertMediaVisualTrim(value: MediaVisualTrim, sourceFrames: number, label: string): void {
  assert(Number.isSafeInteger(value.startFrame) && Number.isSafeInteger(value.endFrameExclusive)
    && value.startFrame >= 0 && value.endFrameExclusive > value.startFrame
    && value.endFrameExclusive <= sourceFrames, `${label} is outside its source.`);
}

export function assertMediaVisualOccupancy(value: MediaVisualOccupancy, label: string): void {
  if (value.mode === "stretch") return;
  assert(["once", "hold", "loop"].includes(value.mode)
    && (value.align === "start" || value.align === "end"), `${label} is invalid.`);
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
  if (value.audio !== undefined) {
    assertBlob(value.audio.artifact, `${label}.audio.artifact`, "audio/");
    assert(Number.isSafeInteger(value.audio.sampleFrames) && value.audio.sampleFrames > 0,
      `${label}.audio.sampleFrames is invalid.`);
  }
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
  if (value.occupancy !== undefined) assertMediaVisualOccupancy(value.occupancy, "MediaSampleLayerSpec.occupancy");
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
  assert(Array.isArray(value.layers), "MediaLayerSet is invalid.");
  const ids = new Set<string>();
  for (const layer of value.layers) {
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
    assertContentFit(layer.fit);
    if (layer.source.kind === "still") {
      assert(layer.trim === undefined && layer.occupancy === undefined,
        `Still Media layer ${layer.id} cannot have trim or occupancy.`);
    } else {
      const frames = layer.source.kind === "timed"
        ? layer.source.frameCount
        : layer.source.surface.timing.kind === "frames" ? layer.source.surface.timing.frameCount : undefined;
      if (frames === undefined) {
        assert(layer.trim === undefined && layer.occupancy === undefined,
          `Still Surface layer ${layer.id} cannot have trim or occupancy.`);
      } else {
        if (layer.trim !== undefined) assertMediaVisualTrim(layer.trim, frames, `Media layer ${layer.id}.trim`);
        assert(layer.occupancy !== undefined, `Timed Media layer ${layer.id} requires occupancy.`);
        assertMediaVisualOccupancy(layer.occupancy, `Media layer ${layer.id}.occupancy`);
      }
    }
    assertMediaSampleLayerSpec({

      id: layer.id,
      ...(layer.trim === undefined ? {} : { trim: layer.trim }),
      ...(layer.occupancy === undefined ? {} : { occupancy: layer.occupancy }),
      appearance: layer.appearance,
      ...(layer.samplingMotion === undefined ? {} : { samplingMotion: layer.samplingMotion }),
    });
  }
}

function append(set: MediaLayerSet, layer: MediaLayerProgram): MediaLayerSet {
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

function sampleLayer(source: MediaVisualSource, fit: ContentFit, spec: MediaSampleLayerSpec): MediaSampleLayerProgram {
  assertMediaVisualSource(source, "Media sample source");
  assertContentFit(fit);
  assertMediaSampleLayerSpec(spec);
  const layer: MediaSampleLayerProgram = {
    id: spec.id,
    kind: "sample",
    source: structuredClone(source),
    fit: structuredClone(fit),
    ...(spec.trim === undefined ? {} : { trim: { ...spec.trim } }),
    ...(spec.occupancy === undefined ? {} : { occupancy: structuredClone(spec.occupancy) }),
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
  assert(spec.trim === undefined && spec.occupancy === undefined,
    "Still Media source cannot have trim or occupancy.");
  return append(set, sampleLayer({ kind: "still", artifact: structuredClone(source), extent: { ...extent } }, fit, spec));
}

export function appendTimedMediaLayer(
  set: MediaLayerSet,
  media: SynchronizedMedia,
  fit: ContentFit,
  spec: MediaSampleLayerSpec,
): MediaLayerSet {
  verifySynchronizedMedia(media);
  assert(media.visual !== undefined, "Timed Media source has no normalized visual member.");
  assert(spec.occupancy !== undefined, "Timed Media source requires explicit occupancy.");
  const source: MediaVisualSource = {
    kind: "timed",
    artifact: structuredClone(media.visual.artifact),
    extent: {
      widthPx: media.visual.width,
      heightPx: media.visual.height,
    },
    frameRate: { ...media.timeline.frameRate },
    frameCount: media.timeline.frameCount,
    ...(media.audio === undefined ? {} : { audio: {
      artifact: structuredClone(media.audio.artifact),
      sampleFrames: synchronizedMediaSampleFrames(media),
    } }),
  };
  return append(set, sampleLayer(source, fit, spec));
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
    effectiveSpec = spec.occupancy === undefined
      ? sealMediaSampleLayerSpec({ ...spec, occupancy: { mode: "once", align: "start" } })
      : spec;
  } else {
    assert(spec.trim === undefined && spec.occupancy === undefined,
      "Still Media Surface cannot have trim or occupancy.");
  }
  return append(set, sampleLayer({
    kind: "surface",
    surface: structuredClone(surface),
    extent: { widthPx: surface.width, heightPx: surface.height },
  }, fit, effectiveSpec));
}
