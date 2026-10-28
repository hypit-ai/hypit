import { assertVisualItemSequence, assertVisualProgram, assertVisualTrackIdentity, sealVisualTrack } from "@hypit/composition";
import type { VisualTrack } from "@hypit/composition";
import { assertTemporalWindowFor } from "@hypit/temporal";
import type { TemporalWindow } from "@hypit/temporal";
import { assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import type { VisualAdjustmentEffect, VisualAdjustmentHeader, VisualAdjustmentSet, VisualAdjustmentSpec } from "./types.js";

function nonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`);
}

export function sealVisualAdjustmentHeader(value: VisualAdjustmentHeader): VisualAdjustmentHeader {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("VisualAdjustmentHeader is invalid.");
  }
  nonEmpty(value.id, "VisualAdjustmentHeader.id");
  return { id: value.id };
}

export function createVisualAdjustmentSet(): VisualAdjustmentSet {
  return { items: [] };
}

export function assertVisualAdjustmentSpec(value: VisualAdjustmentSpec): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("VisualAdjustmentSpec is invalid.");
  }
  nonEmpty(value.id, "VisualAdjustmentSpec.id");
  assertVisualProgram(value.effect, "VisualAdjustmentSpec.effect");
}

export function assertVisualAdjustmentEffect(value: VisualAdjustmentEffect): void {
  assertVisualProgram(value, "VisualAdjustmentEffect");
}

export function assertVisualAdjustmentSet(value: VisualAdjustmentSet): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.items)) {
    throw new Error("VisualAdjustmentSet is invalid.");
  }
  assertVisualItemSequence(value.items, undefined, "VisualAdjustmentSet");
  for (const item of value.items) {
    if (item.kind !== "adjustment") throw new Error("VisualAdjustmentSet accepts only Adjustment items.");
  }
}

export function appendVisualAdjustment(
  set: VisualAdjustmentSet,
  header: VisualAdjustmentHeader,
  timeline: Timeline,
  spec: VisualAdjustmentSpec,
  window: TemporalWindow,
): VisualAdjustmentSet {
  assertVisualAdjustmentSet(set);
  sealVisualAdjustmentHeader(header);
  assertTimelineIdentity(timeline);
  assertVisualAdjustmentSpec(spec);
  assertTemporalWindowFor(window, { timeline });
  if (set.items.some((item) => item.id === spec.id)) {
    throw new Error(`Visual Adjustment Track ${header.id} repeats ${spec.id}.`);
  }
  return { items: [...set.items, {
    kind: "adjustment",
    id: spec.id,
    span: { ...window.span },
    program: structuredClone(spec.effect),
  }] };
}

export function finalizeVisualAdjustmentTrack(
  set: VisualAdjustmentSet,
  header: VisualAdjustmentHeader,
  timeline: Timeline,
): VisualTrack {
  assertVisualAdjustmentSet(set);
  if (set.items.length === 0) throw new Error("Visual Adjustment Track requires at least one Adjustment.");
  const track = sealVisualTrack({
    timelineId: timeline.id,
    visualIr: "hypit.visual-ir@1",
    id: sealVisualAdjustmentHeader(header).id,
    items: set.items,
  });
  assertVisualTrackIdentity(track, timeline);
  return track;
}
