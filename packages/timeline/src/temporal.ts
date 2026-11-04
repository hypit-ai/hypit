import { compareCodeUnits } from "@hypit/hypit/protocol";

import { assertFrameSpan, assertTimelineIdentity, timelineFrameCount } from "./identity.js";
import type { TemporalIdentitySpec, TemporalInstant, TemporalWindow, Timeline, WindowRelation } from "./types.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must not be empty.`);
}

export function assertTemporalInstant(value: unknown): asserts value is TemporalInstant {
  const instant = record(value, "TemporalInstant");
  nonEmpty(instant.id, "TemporalInstant.id");
  nonEmpty(instant.subjectId, "TemporalInstant.subjectId");
  nonEmpty(instant.timelineId, "TemporalInstant.timelineId");
  if (!Number.isSafeInteger(instant.frame) || (instant.frame as number) < 0) {
    throw new Error("TemporalInstant.frame must be a non-negative safe integer.");
  }
}

export function assertTemporalWindow(value: unknown): asserts value is TemporalWindow {
  const window = record(value, "TemporalWindow") as unknown as TemporalWindow;
  nonEmpty(window.id, "TemporalWindow.id");
  nonEmpty(window.subjectId, "TemporalWindow.subjectId");
  assertTemporalInstant(window.start);
  assertTemporalInstant(window.end);
  if (window.start.timelineId !== window.end.timelineId) {
    throw new Error("TemporalWindow endpoints belong to different Timelines.");
  }
  assertFrameSpan(window.span);
  if (window.span.startFrame !== window.start.frame || window.span.endFrameExclusive !== window.end.frame) {
    throw new Error("TemporalWindow span disagrees with its endpoints.");
  }
}

export function assertTemporalIdentitySpec(value: unknown): asserts value is TemporalIdentitySpec {
  const spec = record(value, "TemporalIdentitySpec");
  nonEmpty(spec.id, "TemporalIdentitySpec.id");
  nonEmpty(spec.subjectId, "TemporalIdentitySpec.subjectId");
}

export type TemporalConsumption = { readonly timeline?: Timeline };

export function assertTemporalInstantFor(instant: TemporalInstant, expected: TemporalConsumption): void {
  assertTemporalInstant(instant);
  if (expected.timeline === undefined) return;
  assertTimelineIdentity(expected.timeline);
  if (instant.timelineId !== expected.timeline.id) throw new Error("Temporal Instant belongs to a different Timeline.");
  if (instant.frame > timelineFrameCount(expected.timeline)) throw new Error("Temporal Instant falls outside its Timeline.");
}

export function assertTemporalWindowFor(window: TemporalWindow, expected: TemporalConsumption): void {
  assertTemporalWindow(window);
  assertTemporalInstantFor(window.start, expected);
  assertTemporalInstantFor(window.end, expected);
  if (window.span.endFrameExclusive <= window.span.startFrame) {
    throw new Error("Temporal Window span disagrees with its endpoints.");
  }
}

export function resolvedInstant(
  spec: { readonly id: string; readonly subjectId: string },
  timeline: Timeline,
  frame: number,
): TemporalInstant {
  nonEmpty(spec.id, "TemporalInstant.id");
  nonEmpty(spec.subjectId, "TemporalInstant.subjectId");
  assertTimelineIdentity(timeline);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > timelineFrameCount(timeline)) {
    throw new Error("Temporal Instant falls outside Timeline.");
  }
  return { id: spec.id, subjectId: spec.subjectId, timelineId: timeline.id, frame };
}

export function composeTemporalWindow(
  spec: TemporalIdentitySpec,
  start: TemporalInstant,
  end: TemporalInstant,
): TemporalWindow {
  assertTemporalIdentitySpec(spec);
  assertTemporalInstant(start);
  assertTemporalInstant(end);
  if (start.timelineId !== end.timelineId) throw new Error("Temporal Window endpoints must belong to one Timeline.");
  if (end.frame <= start.frame) throw new Error(end.frame < start.frame
    ? "Temporal Window endpoints are reversed." : "Temporal Window endpoints produce a zero window.");
  return { id: spec.id, subjectId: spec.subjectId, start: structuredClone(start), end: structuredClone(end),
    span: { startFrame: start.frame, endFrameExclusive: end.frame } };
}

export function assertWindowRelation(
  windows: readonly TemporalWindow[],
  relation: WindowRelation,
): readonly TemporalWindow[] {
  for (const window of windows) assertTemporalWindow(window);
  if (relation === "independent") return windows;
  const ordered = [...windows].sort((left, right) => left.span.startFrame - right.span.startFrame
    || left.span.endFrameExclusive - right.span.endFrameExclusive || compareCodeUnits(left.id, right.id));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous !== undefined && current !== undefined && current.span.startFrame < previous.span.endFrameExclusive) {
      throw new Error(`Temporal windows ${previous.id} and ${current.id} overlap under disjoint policy.`);
    }
  }
  return windows;
}
