import { assertVisualTrackIdentity, sealPresentVisualTrack } from "@hypit/composition";
import type { PresentVisualTrack } from "@hypit/composition";
import { canonicalize } from "@hypit/hypit/protocol";
import { assertSpatialFrame, assertSpatialPath } from "@hypit/spatial";
import type { SpatialPath } from "@hypit/spatial";
import { assertTemporalWindowFor, exactTemporalValueFromFrames, resolveTemporalRelation, sealLocalTemporalDomain } from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import { assertFrameSpan, assertTimelineIdentity, timelineFrameCount } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";

import {
  assertMediaIdentity,
  assertMediaLayerSet,
} from "./layers.js";
import { lowerVisualClipRoot } from "./lower.js";
import { assertVisualClipMotion, poseAnimation } from "./motion.js";
import { assertVisualFrameTreatment } from "./frame-treatment.js";
import { assertMediaLayerPrograms, assertResolvedSampleLayer, resolveMediaLayerPrograms } from "./spatial.js";
import type {
  MediaLayerSet,
  MediaSampleLayerProgram,
  VisualClipProgram,
  VisualClipMotion,
  VisualClipSpec,
  VisualTrackHeader,
  VisualTrackProgram,
  VisualTrackSet,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function bindVisualClipPath(spec: VisualClipSpec, path: SpatialPath): VisualClipSpec {
  assertVisualClipSpec(spec);
  assertSpatialPath(path);
  return sealVisualClipSpec({
    ...spec,
    treatment: { ...spec.treatment, clip: { kind: "path", path: structuredClone(path) } },
  });
}

export function bindVisualClipMotion(spec: VisualClipSpec, motion: VisualClipMotion): VisualClipSpec {
  assertVisualClipSpec(spec);
  assertVisualClipMotion(motion, "VisualClipMotion");
  return sealVisualClipSpec({ ...spec, motion: structuredClone(motion) });
}

export function assertVisualClipSpec(value: VisualClipSpec): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "VisualClipSpec is invalid.");
  assertMediaIdentity(value.id, "VisualClipSpec.id");
  assertVisualFrameTreatment(value.treatment, "VisualClipSpec.treatment");
  if (value.motion !== undefined) assertVisualClipMotion(value.motion, "VisualClipSpec.motion");
}

export function sealVisualClipSpec(value: VisualClipSpec): VisualClipSpec {
  assertVisualClipSpec(value);
  return canonicalize(value) as unknown as VisualClipSpec;
}

export function sealVisualTrackHeader(value: VisualTrackHeader): VisualTrackHeader {
  assertVisualTrackHeader(value);
  return canonicalize(value) as unknown as VisualTrackHeader;
}

export function assertVisualTrackHeader(value: VisualTrackHeader): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "VisualTrackHeader is invalid.");
  assertMediaIdentity(value.id, "VisualTrackHeader.id");
}

export function createVisualTrackSet(): VisualTrackSet {
  return { clips: [] };
}

export function assertVisualTrackSet(value: VisualTrackSet): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.clips), "VisualTrackSet is invalid.");
  assertVisualClipPrograms(value.clips, "VisualTrackSet");
}

/** Component entry point: source facts, absolute placement and visual treatment are already explicit. */
export function appendVisualClip(
  set: VisualTrackSet,
  header: VisualTrackHeader,
  timeline: Timeline,
  layers: MediaLayerSet,
  frame: VisualClipProgram["frame"],
  spec: VisualClipSpec,
  window: TemporalWindow,
): VisualTrackSet {
  assertVisualTrackSet(set);
  assertVisualTrackHeader(header);
  assertTimelineIdentity(timeline);
  assertMediaLayerSet(layers);
  assert(layers.layers.length > 0, `Visual Clip ${spec.id} requires at least one layer.`);
  assertSpatialFrame(frame);
  assertVisualClipSpec(spec);
  assertTemporalWindowFor(window, { timeline });
  const duration = window.span.endFrameExclusive - window.span.startFrame;
  const resolvedLayers = resolveMediaLayerPrograms(layers, frame, spec.treatment).map((layer) => {
    if (layer.kind !== "sample" || layer.source.kind === "still") return layer;
    let sourceDomain;
    if (layer.source.kind === "timed") {
      sourceDomain = layer.source.media.domain;
    } else {
      if (layer.source.surface.timing.kind === "still") return layer;
      const timing = { frameRate: layer.source.surface.timing.frameRate, frameCount: layer.source.surface.timing.frameCount };
      sourceDomain = sealLocalTemporalDomain({
        id: `${spec.id}:${layer.id}:surface`,
        duration: exactTemporalValueFromFrames(timing.frameCount, { frameRate: timing.frameRate }),
      });
    }
    return {
      ...layer,
      sampling: { kind: "map" as const, value: resolveTemporalRelation({
        target: sealLocalTemporalDomain({
          id: `${spec.id}:${layer.id}:occurrence`,
          duration: exactTemporalValueFromFrames(duration, timeline),
        }),
        source: sourceDomain,
        clock: timeline,
        ...(layer.sampling?.kind !== "relation" ? {} : { spec: layer.sampling.value }),
      }) },
    };
  });
  if (spec.motion !== undefined) {
    assertVisualClipMotion(spec.motion, `Visual Clip ${spec.id} motion`);
    poseAnimation(spec.motion, duration);
  }
  const addition: VisualClipProgram = {
    id: spec.id,
    subjectId: spec.id,
    span: { ...window.span },
    frame: { ...frame },
    treatment: structuredClone(spec.treatment),
    layers: structuredClone(resolvedLayers),
    ...(spec.motion === undefined ? {} : { motion: structuredClone(spec.motion) }),
  };
  assert(!set.clips.some((clip) => clip.id === addition.id), `Visual Track ${header.id} already contains ${addition.id}.`);
  return { clips: [...set.clips, addition] };
}

function assertSampleLayer(layer: MediaSampleLayerProgram, label: string): void {
  assertResolvedSampleLayer(layer, label);
  const timed = layer.source.kind === "timed"
    || layer.source.kind === "surface" && layer.source.surface.timing.kind === "frames";
  if (!timed) {
    assert(layer.sampling === undefined, `${label} is still material and cannot have temporal sampling.`);
    return;
  }
  assert(layer.sampling !== undefined, `${label} requires temporal sampling.`);
}

function assertClip(clip: VisualClipProgram, label: string): void {
  assert(clip !== null && typeof clip === "object" && !Array.isArray(clip), `${label} is invalid.`);
  assertMediaIdentity(clip.id, `${label}.id`);
  assertMediaIdentity(clip.subjectId, `${label}.subjectId`);
  try {
    assertFrameSpan(clip.span);
  } catch {
    throw new Error(`${label}.span is invalid.`);
  }
  assertSpatialFrame(clip.frame);
  assertVisualFrameTreatment(clip.treatment, `${label}.treatment`);
  if (clip.motion !== undefined) {
    assertVisualClipMotion(clip.motion, `${label}.motion`);
    poseAnimation(clip.motion, clip.span.endFrameExclusive - clip.span.startFrame);
  }
  assert(Array.isArray(clip.layers) && clip.layers.length > 0, `${label} requires layers.`);
  assertMediaLayerPrograms(clip.layers);
}

function assertVisualClipPrograms(clips: readonly VisualClipProgram[], label: string): void {
  const ids = new Set<string>();
  for (const [index, clip] of clips.entries()) {
    assertClip(clip, `${label}.clips.${index}`);
    assert(!ids.has(clip.id), `${label} repeats ${clip.id}.`);
    ids.add(clip.id);
  }
}

function assertClipForTimeline(clip: VisualClipProgram, timeline: Timeline, label: string): void {
  assert(clip.span.endFrameExclusive <= timelineFrameCount(timeline), `${label}.span is outside Timeline.`);
  for (const layer of clip.layers) {
    if (layer.kind === "sample") assertSampleLayer(layer, `${label}.${layer.id}`);
  }
}

function normalizeProgram(value: VisualTrackProgram): VisualTrackProgram {
  return {
    id: value.id,
    clips: value.clips.map((clip) => structuredClone(clip)),
  };
}

export function sealVisualTrackProgram(value: VisualTrackProgram, timeline: Timeline): VisualTrackProgram {
  const normalized = normalizeProgram(value);
  assertVisualTrackProgramIdentity(normalized, timeline);
  return canonicalize(normalized) as unknown as VisualTrackProgram;
}

export function finalizeVisualTrack(set: VisualTrackSet, header: VisualTrackHeader, timeline: Timeline): VisualTrackProgram {
  assertVisualTrackSet(set);
  assertVisualTrackHeader(header);
  assert(set.clips.length > 0, "Visual Track requires at least one Clip.");
  return sealVisualTrackProgram({ id: header.id, clips: set.clips }, timeline);
}

export function assertVisualTrackProgram(value: VisualTrackProgram): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.clips), "VisualTrackProgram is invalid.");
  assertMediaIdentity(value.id, "VisualTrackProgram.id");
  assert(value.clips.length > 0, "VisualTrackProgram is empty.");
  assertVisualClipPrograms(value.clips, "VisualTrackProgram");
}

export function assertVisualTrackProgramIdentity(value: VisualTrackProgram, timeline: Timeline): void {
  assertVisualTrackProgram(value);
  assertTimelineIdentity(timeline);
  for (const clip of value.clips) {
    assertClipForTimeline(clip, timeline, `Visual Clip ${clip.id}`);
  }
}

export function projectVisualTrack(timeline: Timeline, program: VisualTrackProgram): PresentVisualTrack {
  assertVisualTrackProgramIdentity(program, timeline);
  const track = sealPresentVisualTrack({
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    id: program.id,
    presents: program.clips.map((clip) => ({
      id: clip.id,
      subjectId: clip.subjectId,
      span: { ...clip.span },
      root: lowerVisualClipRoot(clip),
    })),
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}
