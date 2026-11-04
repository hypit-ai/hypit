import { exactTemporalValueFromDuration } from "./sampling.js";
import type { TemporalSamplingGrid } from "./sampling.js";
import { resolveExactTemporalRelation } from "./exact-relation.js";
import type {
  ExactTemporalRelation,
  ExactTemporalRelationSpec,
  ExactTemporalRelativePoint,
  ExactTemporalRelativeRange,
  LocalTemporalDomain,
  TemporalMap,
  TemporalRelation,
  TemporalRelationSpec,
  TemporalRelativePoint,
  TemporalRelativeRange,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDuration(value: import("./sampling.js").TemporalDuration, label: string): void {
  const numeric = value.unit === "seconds" ? value.numerator : value.value;
  assert(Number.isSafeInteger(numeric) && numeric >= 0, `${label} must be a non-negative exact duration.`);
  if (value.unit === "seconds") {
    assert(Number.isSafeInteger(value.denominator) && value.denominator > 0, `${label} denominator is invalid.`);
  }
}

function assertPoint(value: TemporalRelativePoint, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assert(value.edge === "start" || value.edge === "end", `${label}.edge is invalid.`);
  assertDuration(value.offset, `${label}.offset`);
}

function assertRange(value: TemporalRelativeRange, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assertPoint(value.from, `${label}.from`);
  assertPoint(value.until, `${label}.until`);
}

export function assertTemporalRelationSpec(value: TemporalRelationSpec, label = "TemporalRelationSpec"): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value)
    && Array.isArray(value.relations) && value.relations.length > 0, `${label} requires at least one relation.`);
  for (const [index, relation] of value.relations.entries()) {
    const item = `${label}.relations.${index}`;
    assert(relation !== null && typeof relation === "object" && !Array.isArray(relation), `${item} is invalid.`);
    assertRange(relation.target, `${item}.target`);
    if (relation.kind === "cubic") {
      assertPoint(relation.sourceAtStart, `${item}.sourceAtStart`);
      assertPoint(relation.sourceControl1, `${item}.sourceControl1`);
      assertPoint(relation.sourceControl2, `${item}.sourceControl2`);
      assertPoint(relation.sourceAtEnd, `${item}.sourceAtEnd`);
      continue;
    }
    assertRange(relation.source, `${item}.source`);
    if (relation.kind === "fit") continue;
    assert(relation.kind === "rate", `${item}.kind is invalid.`);
    assertPoint(relation.targetAt, `${item}.targetAt`);
    assertPoint(relation.sourceAt, `${item}.sourceAt`);
    assert(Number.isSafeInteger(relation.rate.numerator)
      && Number.isSafeInteger(relation.rate.denominator) && relation.rate.denominator > 0,
    `${item}.rate is invalid.`);
    if (relation.wrap !== undefined) assertRange(relation.wrap, `${item}.wrap`);
  }
}

const ZERO_DURATION = { unit: "seconds", numerator: 0, denominator: 1 } as const;
const START: TemporalRelativePoint = { edge: "start", offset: ZERO_DURATION };
const END: TemporalRelativePoint = { edge: "end", offset: ZERO_DURATION };
const FULL: TemporalRelativeRange = { from: START, until: END };

export function defaultTemporalRelationSpec(): TemporalRelationSpec {
  return { relations: [{
    kind: "rate",
    target: FULL,
    targetAt: START,
    sourceAt: START,
    rate: { numerator: 1, denominator: 1 },
    source: FULL,
  }] };
}

function exactPoint(point: TemporalRelativePoint, grid: TemporalSamplingGrid): ExactTemporalRelativePoint {
  return { edge: point.edge, offset: exactTemporalValueFromDuration(point.offset, grid) };
}

function exactRange(value: TemporalRelativeRange, grid: TemporalSamplingGrid): ExactTemporalRelativeRange {
  return { from: exactPoint(value.from, grid), until: exactPoint(value.until, grid) };
}

function exactRelation(value: TemporalRelation, grid: TemporalSamplingGrid): ExactTemporalRelation {
  if (value.kind === "cubic") return {
    kind: "cubic",
    target: exactRange(value.target, grid),
    sourceAtStart: exactPoint(value.sourceAtStart, grid),
    sourceControl1: exactPoint(value.sourceControl1, grid),
    sourceControl2: exactPoint(value.sourceControl2, grid),
    sourceAtEnd: exactPoint(value.sourceAtEnd, grid),
  };
  if (value.kind === "fit") return {
    kind: "fit",
    target: exactRange(value.target, grid),
    source: exactRange(value.source, grid),
  };
  return {
    kind: "rate",
    target: exactRange(value.target, grid),
    targetAt: exactPoint(value.targetAt, grid),
    sourceAt: exactPoint(value.sourceAt, grid),
    rate: { ...value.rate },
    source: exactRange(value.source, grid),
    ...(value.wrap === undefined ? {} : { wrap: exactRange(value.wrap, grid) }),
  };
}

/** Bind duration-based author syntax through the clock-free exact relation algebra. */
export function resolveTemporalRelation(input: {
  readonly target: LocalTemporalDomain;
  readonly source: LocalTemporalDomain;
  readonly grid: TemporalSamplingGrid;
  readonly spec?: TemporalRelationSpec;
}): TemporalMap {
  const spec = input.spec ?? defaultTemporalRelationSpec();
  assertTemporalRelationSpec(spec);
  const exact: ExactTemporalRelationSpec = {
    relations: spec.relations.map((relation) => exactRelation(relation, input.grid)),
  };
  return resolveExactTemporalRelation({ target: input.target, source: input.source, spec: exact });
}
