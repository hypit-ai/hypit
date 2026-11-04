import { assertTemporalDuration } from "@hypit/temporal";

import type {
  TimelineAuthorParameter,
  TimelineInstantExpression,
  TimelineInstantSpec,
  TimelineShiftSpec,
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

function assertAuthorParameter(value: unknown, label: string): asserts value is TimelineAuthorParameter {
  const author = record(value, label);
  nonEmpty(author.binding, `${label}.binding`);
  if (author.relation !== "direct" && author.relation !== "after-start" && author.relation !== "before-end") {
    throw new Error(`${label}.relation is invalid.`);
  }
}

export function assertTimelineInstantExpression(
  value: unknown,
  label = "TimelineInstantExpression",
): asserts value is TimelineInstantExpression {
  const expression = record(value, label);
  if (expression.offset !== undefined) assertTemporalDuration(expression.offset, `${label}.offset`);
  if (expression.ref === "timeline.start" || expression.ref === "timeline.end") return;
  if (expression.ref === "absolute") {
    assertTemporalDuration(expression.at, `${label}.at`);
    return;
  }
  throw new Error(`${label}.ref is invalid.`);
}

export function assertTimelineInstantSpec(value: unknown): asserts value is TimelineInstantSpec {
  const spec = record(value, "TimelineInstantSpec");
  nonEmpty(spec.id, "TimelineInstantSpec.id");
  nonEmpty(spec.subjectId, "TimelineInstantSpec.subjectId");
  assertTimelineInstantExpression(spec.projection, "TimelineInstantSpec.projection");
  if (spec.author !== undefined) assertAuthorParameter(spec.author, "TimelineInstantSpec.author");
}

export function assertTimelineShiftSpec(value: unknown): asserts value is TimelineShiftSpec {
  const spec = record(value, "TimelineShiftSpec");
  nonEmpty(spec.id, "TimelineShiftSpec.id");
  nonEmpty(spec.subjectId, "TimelineShiftSpec.subjectId");
  if (spec.direction !== 1 && spec.direction !== -1) throw new Error("TimelineShiftSpec.direction is invalid.");
  if (spec.resolution !== undefined && spec.resolution !== "exact" && spec.resolution !== "cover"
    && spec.resolution !== "inside" && spec.resolution !== "nearest") {
    throw new Error("TimelineShiftSpec.resolution is invalid.");
  }
  if (spec.author !== undefined) assertAuthorParameter(spec.author, "TimelineShiftSpec.author");
}
