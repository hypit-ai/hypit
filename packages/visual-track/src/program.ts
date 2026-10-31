import { assertVisualProcessEffect, assertVisualTrackIdentity, sealVisualProcessEffect, sealVisualTrack } from "@hypit/composition";
import type { VisualPresent, VisualTrack } from "@hypit/composition";
import { canonicalize } from "@hypit/hypit/protocol";
import { assertSpatialFrame, assertSpatialPath } from "@hypit/spatial";
import type { SpatialPath } from "@hypit/spatial";
import { assertTemporalWindowFor, compareExactTemporalValues, exactTemporalValueFromFrames, resolveTemporalRelation, sealLocalTemporalDomain } from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import { assertFrameSpan, assertTimelineIdentity, timelineFrameCount } from "@hypit/timeline";
import type { FrameSpan, Timeline } from "@hypit/timeline";

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
  VisualTransitionSpec,
  VisualTransitionEffect,
  VisualTrackHeader,
  VisualTrackProgram,
  VisualTrackSet,
} from "./types.js";
import { VISUAL_TRANSITION_INPUTS } from "./types.js";

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
  return { clips: [], transitions: [] };
}

export function assertVisualTrackSet(value: VisualTrackSet): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.clips) && Array.isArray(value.transitions), "VisualTrackSet is invalid.");
  assertVisualClipPrograms(value.clips, "VisualTrackSet");
  assertVisualTransitions(value.transitions, value.clips, "VisualTrackSet");
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
    if (layer.sampling?.kind === "map") {
      const targetDuration = exactTemporalValueFromFrames(duration, timeline);
      const first = layer.sampling.value.stages[0]!.target;
      const last = layer.sampling.value.stages.at(-1)!.source;
      assert(compareExactTemporalValues(first.duration, targetDuration) === 0,
        `Visual Clip ${spec.id}.${layer.id} sampling target differs from its Window.`);
      assert(last.id === sourceDomain.id && compareExactTemporalValues(last.duration, sourceDomain.duration) === 0,
        `Visual Clip ${spec.id}.${layer.id} sampling source differs from its source domain.`);
      return layer;
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
  return { clips: [...set.clips, addition], transitions: set.transitions };
}

export function assertVisualTransitionEffect(value: VisualTransitionEffect): void {
  assertVisualProcessEffect(value, "VisualTransitionEffect");
  assert(value.inputs.length === VISUAL_TRANSITION_INPUTS.length
    && value.inputs.every((name, index) => name === VISUAL_TRANSITION_INPUTS[index]),
  "VisualTransitionEffect inputs must be outgoing followed by incoming.");
}

export function sealVisualTransitionEffect(value: VisualTransitionEffect): VisualTransitionEffect {
  assertVisualTransitionEffect(value);
  const effect = sealVisualProcessEffect(value);
  return { inputs: [...VISUAL_TRANSITION_INPUTS], program: effect.program };
}

export function assertVisualTransitionSpec(value: VisualTransitionSpec): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "VisualTransitionSpec is invalid.");
  assertMediaIdentity(value.id, "VisualTransitionSpec.id");
  assertMediaIdentity(value.outgoingClipId, "VisualTransitionSpec.outgoingClipId");
  assertMediaIdentity(value.incomingClipId, "VisualTransitionSpec.incomingClipId");
  assert(value.outgoingClipId !== value.incomingClipId, "Visual Transition requires two different Clips.");
  assertVisualTransitionEffect(value.effect);
}

function transitionIntersection(outgoing: VisualClipProgram, incoming: VisualClipProgram): FrameSpan {
  return {
    startFrame: Math.max(outgoing.span.startFrame, incoming.span.startFrame),
    endFrameExclusive: Math.min(outgoing.span.endFrameExclusive, incoming.span.endFrameExclusive),
  };
}

/** Derive the one interval owned by a Transition relation from its two Clip occurrences. */
export function visualTransitionSpan(
  transition: VisualTransitionSpec,
  clips: readonly VisualClipProgram[],
): FrameSpan {
  assertVisualTransitionSpec(transition);
  const outgoing = clips.find((clip) => clip.id === transition.outgoingClipId);
  const incoming = clips.find((clip) => clip.id === transition.incomingClipId);
  assert(outgoing !== undefined, `Visual Transition references missing outgoing Clip ${transition.outgoingClipId}.`);
  assert(incoming !== undefined, `Visual Transition references missing incoming Clip ${transition.incomingClipId}.`);
  return transitionIntersection(outgoing, incoming);
}

function assertTransition(
  transition: VisualTransitionSpec,
  clips: readonly VisualClipProgram[],
  label: string,
): void {
  assertVisualTransitionSpec(transition);
  const outgoingIndex = clips.findIndex((clip) => clip.id === transition.outgoingClipId);
  const incomingIndex = clips.findIndex((clip) => clip.id === transition.incomingClipId);
  assert(outgoingIndex >= 0, `${label} references missing outgoing Clip ${transition.outgoingClipId}.`);
  assert(incomingIndex >= 0, `${label} references missing incoming Clip ${transition.incomingClipId}.`);
  assert(incomingIndex === outgoingIndex + 1,
    `${label} requires outgoing and incoming Clips to be adjacent in Track paint order.`);
  const outgoing = clips[outgoingIndex]!;
  const incoming = clips[incomingIndex]!;
  assert(outgoing.span.startFrame < incoming.span.startFrame
    && outgoing.span.endFrameExclusive < incoming.span.endFrameExclusive,
  `${label} requires an outgoing Clip that starts and ends before the incoming Clip.`);
  const intersection = visualTransitionSpan(transition, clips);
  assert(intersection.startFrame < intersection.endFrameExclusive,
    `${label} requires overlapping Clip Windows.`);
}

function assertVisualTransitions(
  transitions: readonly VisualTransitionSpec[],
  clips: readonly VisualClipProgram[],
  label: string,
): void {
  const ids = new Set<string>();
  const clipIds = new Set(clips.map((clip) => clip.id));
  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  for (const [index, transition] of transitions.entries()) {
    const item = `${label}.transitions.${index}`;
    assertTransition(transition, clips, item);
    assert(!clipIds.has(transition.id), `${label} Transition ${transition.id} conflicts with a Clip id.`);
    assert(!ids.has(transition.id), `${label} repeats Transition ${transition.id}.`);
    assert(!incoming.has(transition.incomingClipId),
      `${label} repeats incoming Transition for ${transition.incomingClipId}.`);
    assert(!outgoing.has(transition.outgoingClipId),
      `${label} repeats outgoing Transition for ${transition.outgoingClipId}.`);
    ids.add(transition.id);
    incoming.add(transition.incomingClipId);
    outgoing.add(transition.outgoingClipId);
  }
  for (let left = 0; left < transitions.length; left += 1) for (let right = left + 1; right < transitions.length; right += 1) {
    const a = transitions[left]!;
    const b = transitions[right]!;
    const shared = a.outgoingClipId === b.outgoingClipId || a.outgoingClipId === b.incomingClipId
      || a.incomingClipId === b.outgoingClipId || a.incomingClipId === b.incomingClipId;
    const aSpan = visualTransitionSpan(a, clips);
    const bSpan = visualTransitionSpan(b, clips);
    const overlaps = aSpan.startFrame < bSpan.endFrameExclusive && bSpan.startFrame < aSpan.endFrameExclusive;
    assert(!shared || !overlaps, `${label} has simultaneous Transitions ${a.id} and ${b.id} sharing one Clip.`);
  }
}

export function appendVisualTransition(
  set: VisualTrackSet,
  spec: VisualTransitionSpec,
): VisualTrackSet {
  assertVisualTrackSet(set);
  assertVisualTransitionSpec(spec);
  const transition = structuredClone(spec);
  const next = { clips: set.clips, transitions: [...set.transitions, transition] };
  assertVisualTrackSet(next);
  return next;
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
    transitions: value.transitions.map((transition) => structuredClone(transition)),
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
  return sealVisualTrackProgram({ id: header.id, clips: set.clips, transitions: set.transitions }, timeline);
}

export function assertVisualTrackProgram(value: VisualTrackProgram): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.clips) && Array.isArray(value.transitions), "VisualTrackProgram is invalid.");
  assertMediaIdentity(value.id, "VisualTrackProgram.id");
  assertVisualClipPrograms(value.clips, "VisualTrackProgram");
  assertVisualTransitions(value.transitions, value.clips, "VisualTrackProgram");
}

export function assertVisualTrackProgramIdentity(value: VisualTrackProgram, timeline: Timeline): void {
  assertVisualTrackProgram(value);
  assertTimelineIdentity(timeline);
  for (const clip of value.clips) {
    assertClipForTimeline(clip, timeline, `Visual Clip ${clip.id}`);
  }
}

export function projectVisualTrack(timeline: Timeline, program: VisualTrackProgram): VisualTrack {
  assertVisualTrackProgramIdentity(program, timeline);
  const base = new Map(program.clips.map((clip): readonly [string, VisualPresent] => [clip.id, {
    kind: "present",
    id: clip.id,
    subjectId: clip.subjectId,
    span: { ...clip.span },
    root: lowerVisualClipRoot(clip),
  }]));
  const transitions = program.transitions.map((transition) => ({
    transition,
    span: visualTransitionSpan(transition, program.clips),
  }));
  const hidden = new Map<string, FrameSpan[]>();
  for (const { transition, span } of transitions) for (const clipId of [transition.outgoingClipId, transition.incomingClipId]) {
    const spans = hidden.get(clipId) ?? [];
    spans.push({ ...span });
    hidden.set(clipId, spans);
  }
  const visibleSpans = (clip: VisualPresent): FrameSpan[] => {
    const exclusions = [...(hidden.get(clip.id) ?? [])].sort((left, right) => left.startFrame - right.startFrame);
    const result: FrameSpan[] = [];
    let cursor = clip.span.startFrame;
    for (const exclusion of exclusions) {
      if (cursor < exclusion.startFrame) result.push({ startFrame: cursor, endFrameExclusive: exclusion.startFrame });
      cursor = Math.max(cursor, exclusion.endFrameExclusive);
    }
    if (cursor < clip.span.endFrameExclusive) result.push({ startFrame: cursor, endFrameExclusive: clip.span.endFrameExclusive });
    return result;
  };
  const transitionsByIncoming = new Map(transitions.map((resolved) => [resolved.transition.incomingClipId, resolved]));
  const items = program.clips.flatMap((clip) => {
    const present = base.get(clip.id)!;
    const visibility = visibleSpans(present);
    const authored = visibility.length === 1
      && visibility[0]!.startFrame === present.span.startFrame
      && visibility[0]!.endFrameExclusive === present.span.endFrameExclusive
      ? present
      : { ...present, visibility };
    const resolved = transitionsByIncoming.get(clip.id);
    if (resolved === undefined) return [authored];
    const { transition, span } = resolved;
    const outgoing = base.get(transition.outgoingClipId)!;
    const incoming = base.get(transition.incomingClipId)!;
    return [{
      kind: "process" as const,
      id: transition.id,
      subjectId: transition.id,
      span: { ...span },
      inputs: [
        { name: "outgoing", contribution: structuredClone(outgoing) },
        { name: "incoming", contribution: structuredClone(incoming) },
      ],
      effect: sealVisualTransitionEffect(transition.effect),
    }, authored];
  });
  const track = sealVisualTrack({
    timelineId: timeline.id,

    id: program.id,
    items,
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}
