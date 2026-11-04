import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalRational,
  exactTemporalValue,
  exactTemporalZero,
  subtractExactTemporalValues,
} from "./exact.js";
import { assertLocalTemporalDomain } from "./domain.js";
import { sealTemporalMap } from "./map.js";
import { add, compare, divide, maximum, minimum, multiply, rational, subtract } from "./rational.js";
import type { Rational } from "./rational.js";
import type {
  ExactTemporalRelation,
  ExactTemporalRelationSpec,
  ExactTemporalRelativePoint,
  ExactTemporalRelativeRange,
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalMap,
  TemporalMapPiece,
  TemporalRate,
} from "./algebra-types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function safeRate(value: Rational, label: string): TemporalRate {
  assert(value.numerator >= BigInt(Number.MIN_SAFE_INTEGER)
    && value.numerator <= BigInt(Number.MAX_SAFE_INTEGER)
    && value.denominator <= BigInt(Number.MAX_SAFE_INTEGER), `${label} exceeds safe wire arithmetic.`);
  return { numerator: Number(value.numerator), denominator: Number(value.denominator) };
}

function assertPoint(value: ExactTemporalRelativePoint, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assert(value.edge === "start" || value.edge === "end", `${label}.edge is invalid.`);
  assertExactTemporalValue(value.offset, `${label}.offset`);
  assert(compareExactTemporalValues(value.offset, exactTemporalZero()) >= 0,
    `${label}.offset must be non-negative.`);
}

function assertRange(value: ExactTemporalRelativeRange, label: string): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} is invalid.`);
  assertPoint(value.from, `${label}.from`);
  assertPoint(value.until, `${label}.until`);
}

export function assertExactTemporalRelationSpec(
  value: ExactTemporalRelationSpec,
  label = "ExactTemporalRelationSpec",
): void {
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

const ZERO = exactTemporalZero();
const START: ExactTemporalRelativePoint = { edge: "start", offset: ZERO };
const END: ExactTemporalRelativePoint = { edge: "end", offset: ZERO };
const FULL: ExactTemporalRelativeRange = { from: START, until: END };

export function defaultExactTemporalRelationSpec(): ExactTemporalRelationSpec {
  return { relations: [{
    kind: "rate",
    target: FULL,
    targetAt: START,
    sourceAt: START,
    rate: { numerator: 1, denominator: 1 },
    source: FULL,
  }] };
}

function position(
  point: ExactTemporalRelativePoint,
  domain: LocalTemporalDomain,
  label: string,
): ExactTemporalValue {
  const value = point.edge === "start"
    ? point.offset
    : subtractExactTemporalValues(domain.duration, point.offset);
  assert(compareExactTemporalValues(value, exactTemporalZero()) >= 0
    && compareExactTemporalValues(value, domain.duration) <= 0,
  `${label} is outside domain ${domain.id}.`);
  return value;
}

function range(value: ExactTemporalRelativeRange, domain: LocalTemporalDomain, label: string) {
  const start = position(value.from, domain, `${label}.from`);
  const end = position(value.until, domain, `${label}.until`);
  assert(compareExactTemporalValues(start, end) < 0, `${label} is empty or reversed.`);
  return { start, end };
}

function sourceAt(sourceAnchor: Rational, targetAnchor: Rational, rate: Rational, target: Rational): Rational {
  return add(sourceAnchor, multiply(subtract(target, targetAnchor), rate));
}

function modulo(value: Rational, modulus: Rational): Rational {
  assert(modulus.numerator > 0n, "Exact temporal relation wrap must be non-empty.");
  const scaledNumerator = value.numerator * modulus.denominator;
  const scaledDenominator = value.denominator * modulus.numerator;
  let quotient = scaledNumerator / scaledDenominator;
  if (scaledNumerator < 0n && scaledNumerator % scaledDenominator !== 0n) quotient -= 1n;
  return subtract(value, multiply(modulus, rational(quotient)));
}

function wrapped(value: Rational, interval: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue }): Rational {
  const start = exactTemporalRational(interval.start);
  const length = subtract(exactTemporalRational(interval.end), start);
  return add(start, modulo(subtract(value, start), length));
}

function clippedTarget(input: {
  readonly target: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue };
  readonly source: { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue };
  readonly targetAnchor: ExactTemporalValue;
  readonly sourceAnchor: ExactTemporalValue;
  readonly rate: TemporalRate;
}): { readonly start: ExactTemporalValue; readonly end: ExactTemporalValue } | undefined {
  const targetStart = exactTemporalRational(input.target.start);
  const targetEnd = exactTemporalRational(input.target.end);
  const sourceStart = exactTemporalRational(input.source.start);
  const sourceEnd = exactTemporalRational(input.source.end);
  const targetAnchor = exactTemporalRational(input.targetAnchor);
  const sourceAnchor = exactTemporalRational(input.sourceAnchor);
  const rate = rational(BigInt(input.rate.numerator), BigInt(input.rate.denominator));
  if (rate.numerator === 0n) {
    return compare(sourceAnchor, sourceStart) >= 0 && compare(sourceAnchor, sourceEnd) < 0
      ? input.target : undefined;
  }
  const atSourceStart = add(targetAnchor, divide(subtract(sourceStart, sourceAnchor), rate));
  const atSourceEnd = add(targetAnchor, divide(subtract(sourceEnd, sourceAnchor), rate));
  const lower = rate.numerator > 0n ? atSourceStart : atSourceEnd;
  const upper = rate.numerator > 0n ? atSourceEnd : atSourceStart;
  const start = maximum(targetStart, lower);
  const end = minimum(targetEnd, upper);
  return compare(start, end) < 0 ? { start: exactTemporalValue(start), end: exactTemporalValue(end) } : undefined;
}

function resolveRelation(
  relation: ExactTemporalRelation,
  target: LocalTemporalDomain,
  source: LocalTemporalDomain,
  label: string,
): TemporalMapPiece {
  const targetRange = range(relation.target, target, `${label}.target`);
  if (relation.kind === "cubic") {
    return {
      target: targetRange,
      sourceAtStart: position(relation.sourceAtStart, source, `${label}.sourceAtStart`),
      sourceControl1: position(relation.sourceControl1, source, `${label}.sourceControl1`),
      sourceControl2: position(relation.sourceControl2, source, `${label}.sourceControl2`),
      sourceAtEnd: position(relation.sourceAtEnd, source, `${label}.sourceAtEnd`),
    };
  }
  const sourceRange = range(relation.source, source, `${label}.source`);
  if (relation.kind === "fit") {
    const targetLength = subtract(exactTemporalRational(targetRange.end), exactTemporalRational(targetRange.start));
    const sourceLength = subtract(exactTemporalRational(sourceRange.end), exactTemporalRational(sourceRange.start));
    return {
      target: targetRange,
      sourceAtStart: sourceRange.start,
      rate: safeRate(divide(sourceLength, targetLength), `${label}.rate`),
    };
  }
  const targetAt = position(relation.targetAt, target, `${label}.targetAt`);
  const sourceAnchor = position(relation.sourceAt, source, `${label}.sourceAt`);
  const wrap = relation.wrap === undefined ? undefined : range(relation.wrap, source, `${label}.wrap`);
  const resolvedTarget = wrap === undefined ? clippedTarget({
    target: targetRange, source: sourceRange, targetAnchor: targetAt, sourceAnchor, rate: relation.rate,
  }) : targetRange;
  assert(resolvedTarget !== undefined, `${label} does not sample its source domain.`);
  const rawStart = sourceAt(exactTemporalRational(sourceAnchor), exactTemporalRational(targetAt),
    rational(BigInt(relation.rate.numerator), BigInt(relation.rate.denominator)),
    exactTemporalRational(resolvedTarget.start));
  return {
    target: resolvedTarget,
    sourceAtStart: exactTemporalValue(wrap === undefined ? rawStart : wrapped(rawStart, wrap)),
    rate: { ...relation.rate },
    ...(wrap === undefined ? {} : { wrap }),
  };
}

/** Bind one clock-free occurrence relation to two explicit finite domains. */
export function resolveExactTemporalRelation(input: {
  readonly target: LocalTemporalDomain;
  readonly source: LocalTemporalDomain;
  readonly spec?: ExactTemporalRelationSpec;
}): TemporalMap {
  assertLocalTemporalDomain(input.target);
  assertLocalTemporalDomain(input.source);
  const spec = input.spec ?? defaultExactTemporalRelationSpec();
  assertExactTemporalRelationSpec(spec);
  const pieces = spec.relations.map((relation, index) => resolveRelation(
    relation, input.target, input.source, `ExactTemporalRelationSpec.relations.${index}`,
  )).sort((left, right) => compareExactTemporalValues(left.target.start, right.target.start));
  return sealTemporalMap({
    stages: [{ target: structuredClone(input.target), source: structuredClone(input.source), pieces }],
  });
}
