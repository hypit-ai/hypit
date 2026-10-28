import { assertFrameSpan } from "@hypit/timeline";

import type {
  TemporalAuthorParameter,
  TemporalDuration,
  TemporalInstant,
  TemporalInstantExpression,
  TemporalInstantSpec,
  TemporalShiftSpec,
  TemporalWindow,
  TemporalWindowSpec,
} from "./types.js";

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must not be empty.`);
}

function safeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
}

export function assertTemporalDuration(value: unknown, label = "TemporalDuration"): asserts value is TemporalDuration {
  const duration = record(value, label);
  if (duration.unit === "frames" || duration.unit === "milliseconds") {
    safeInteger(duration.value, `${label}.value`);
    return;
  }
  if (duration.unit === "seconds") {
    safeInteger(duration.numerator, `${label}.numerator`);
    safeInteger(duration.denominator, `${label}.denominator`);
    if (duration.denominator <= 0) throw new Error(`${label}.denominator must be positive.`);
    return;
  }
  throw new Error(`${label}.unit is invalid.`);
}

function assertAuthorParameter(value: unknown, label: string): asserts value is TemporalAuthorParameter {
  const author = record(value, label);
  nonEmpty(author.binding, `${label}.binding`);
  if (author.relation !== "direct" && author.relation !== "after-start" && author.relation !== "before-end") {
    throw new Error(`${label}.relation is invalid.`);
  }
}

export function assertTemporalInstantExpression(
  value: unknown,
  label = "TemporalInstantExpression",
): asserts value is TemporalInstantExpression {
  const expression = record(value, label);
  if (expression.offset !== undefined) assertTemporalDuration(expression.offset, `${label}.offset`);
  if (expression.ref === "timeline.start" || expression.ref === "timeline.end") return;
  if (expression.ref === "absolute") {
    assertTemporalDuration(expression.at, `${label}.at`);
    return;
  }
  throw new Error(`${label}.ref is invalid.`);
}

export function assertTemporalInstantSpec(value: unknown): asserts value is TemporalInstantSpec {
  const spec = record(value, "TemporalInstantSpec");
  nonEmpty(spec.id, "TemporalInstantSpec.id");
  nonEmpty(spec.subjectId, "TemporalInstantSpec.subjectId");
  assertTemporalInstantExpression(spec.projection, "TemporalInstantSpec.projection");
  if (spec.author !== undefined) assertAuthorParameter(spec.author, "TemporalInstantSpec.author");
}

export function assertTemporalShiftSpec(value: unknown): asserts value is TemporalShiftSpec {
  const spec = record(value, "TemporalShiftSpec");
  nonEmpty(spec.id, "TemporalShiftSpec.id");
  nonEmpty(spec.subjectId, "TemporalShiftSpec.subjectId");
  if (spec.direction !== 1 && spec.direction !== -1) throw new Error("TemporalShiftSpec.direction is invalid.");
  if (spec.resolution !== undefined && spec.resolution !== "exact" && spec.resolution !== "cover"
    && spec.resolution !== "inside" && spec.resolution !== "nearest") {
    throw new Error("TemporalShiftSpec.resolution is invalid.");
  }
  if (spec.author !== undefined) assertAuthorParameter(spec.author, "TemporalShiftSpec.author");
}

export function assertTemporalWindowSpec(value: unknown): asserts value is TemporalWindowSpec {
  const spec = record(value, "TemporalWindowSpec");
  nonEmpty(spec.id, "TemporalWindowSpec.id");
  nonEmpty(spec.subjectId, "TemporalWindowSpec.subjectId");
}

export function assertTemporalInstant(value: unknown): asserts value is TemporalInstant {
  const instant = record(value, "TemporalInstant");
  nonEmpty(instant.id, "TemporalInstant.id");
  nonEmpty(instant.subjectId, "TemporalInstant.subjectId");
  nonEmpty(instant.timelineId, "TemporalInstant.timelineId");
  safeInteger(instant.frame, "TemporalInstant.frame");
  if (instant.frame < 0) throw new Error("TemporalInstant.frame must be non-negative.");
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
