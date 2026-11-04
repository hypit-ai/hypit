import {
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  assertTemporalMap,
  compareExactTemporalValues,
  composeTemporalMaps,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalZero,
  identityTemporalMap,
  sealTemporalMap,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type Rational,
  type TemporalMap,
} from "@hypit/temporal/algebra";
import {
  assertSpatialMap,
  interpolateSpatialMaps,
  sameSpatialDomain,
  type LocalSpatialDomain,
  type SpatialMap,
} from "@hypit/spatial/algebra";

import { occurrenceParentRange } from "./occurrence.js";
import type {
  AudiovisualProgram,
  SpatialMapControl,
  SpatialMapInterpolation,
  TemporalControl,
  TemporalControlBinding,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameTemporalDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id
    && compareExactTemporalValues(left.duration, right.duration) === 0;
}

function contains(domain: LocalTemporalDomain, at: ExactTemporalValue): boolean {
  return compareExactTemporalValues(at, exactTemporalZero()) >= 0
    && compareExactTemporalValues(at, domain.duration) < 0;
}

function divisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function unitRatio(numerator: ExactTemporalValue, denominator: ExactTemporalValue): Rational {
  const left = exactTemporalRational(numerator);
  const right = exactTemporalRational(denominator);
  assert(right.numerator > 0n, "Control segment duration must be positive.");
  const rawNumerator = left.numerator * right.denominator;
  const rawDenominator = left.denominator * right.numerator;
  assert(rawNumerator >= 0n && rawNumerator <= rawDenominator,
    "Control interpolation progress lies outside [0, 1].");
  const common = divisor(rawNumerator, rawDenominator);
  return { numerator: rawNumerator / common, denominator: rawDenominator / common };
}

export function assertTemporalControl<Value, Interpolation>(
  value: TemporalControl<Value, Interpolation>,
  assertValue: (value: Value, label: string) => void,
  assertInterpolation: (value: Interpolation, label: string) => void,
): void {
  assertLocalTemporalDomain(value.domain);
  assert(value.segments.length > 0, `Control ${value.domain.id} has no segments.`);
  let cursor = exactTemporalZero();
  for (const [index, segment] of value.segments.entries()) {
    const label = `Control ${value.domain.id} segment ${index}`;
    assertExactTemporalValue(segment.range.start, `${label}.range.start`);
    assertExactTemporalValue(segment.range.end, `${label}.range.end`);
    assert(compareExactTemporalValues(segment.range.start, cursor) === 0,
      `${label} does not begin at the previous segment boundary.`);
    assert(compareExactTemporalValues(segment.range.start, segment.range.end) < 0,
      `${label} must be non-empty.`);
    assert(compareExactTemporalValues(segment.range.end, value.domain.duration) <= 0,
      `${label} exceeds Control domain ${value.domain.id}.`);
    assertValue(segment.from, `${label}.from`);
    assertValue(segment.to, `${label}.to`);
    assertInterpolation(segment.interpolation, `${label}.interpolation`);
    cursor = segment.range.end;
  }
  assert(compareExactTemporalValues(cursor, value.domain.duration) === 0,
    `Control ${value.domain.id} does not cover its complete domain.`);
}

export function evaluateTemporalControl<Value, Interpolation>(
  value: TemporalControl<Value, Interpolation>,
  at: ExactTemporalValue,
  interpolate: (
    from: Value,
    to: Value,
    progress: Rational,
    interpolation: Interpolation,
  ) => Value,
): Value {
  assertTemporalControl(value, () => {}, () => {});
  assertExactTemporalValue(at, "Control position");
  assert(contains(value.domain, at), `Control position lies outside domain ${value.domain.id}.`);
  const segment = value.segments.find((candidate) =>
    compareExactTemporalValues(at, candidate.range.start) >= 0
      && compareExactTemporalValues(at, candidate.range.end) < 0);
  assert(segment !== undefined, `Control ${value.domain.id} has no segment at the selected position.`);
  const progress = unitRatio(
    subtractExactTemporalValues(at, segment.range.start),
    subtractExactTemporalValues(segment.range.end, segment.range.start),
  );
  return interpolate(segment.from, segment.to, progress, segment.interpolation);
}

function controlBindingDomain(
  binding: TemporalControlBinding,
  program: AudiovisualProgram,
): LocalTemporalDomain {
  switch (binding.kind) {
    case "program": return program.domain;
    case "occurrence": {
      const occurrence = program.occurrences[binding.occurrence];
      assert(occurrence !== undefined,
        `Control binding references missing Occurrence ${binding.occurrence}.`);
      return occurrence.domain;
    }
    case "source": {
      const occurrence = program.occurrences[binding.occurrence];
      assert(occurrence !== undefined,
        `Control binding references missing Occurrence ${binding.occurrence}.`);
      const output = occurrence.source.outputs[binding.output];
      assert(output !== undefined,
        `Control binding references missing Source output ${binding.output}.`);
      const selection = occurrence.selections[binding.output];
      assert(selection !== undefined,
        `Control binding has no Selection for Source output ${binding.output}.`);
      assert(selection.kind === "signal" && output.kind === "signal",
        `Control binding Source output ${binding.output} is constant and has no temporal Domain.`);
      return output.domain;
    }
    case "mapping": {
      assertTemporalMap(binding.mapping);
      const first = binding.mapping.stages[0];
      const last = binding.mapping.stages.at(-1);
      assert(first !== undefined && sameTemporalDomain(first.target, program.domain),
        `Control binding Mapping must begin in Programme domain ${program.domain.id}.`);
      assert(last !== undefined, "Control binding Mapping has no source domain.");
      return last.source;
    }
  }
}

export function assertTemporalControlBinding(
  controlDomain: LocalTemporalDomain,
  binding: TemporalControlBinding,
  program: AudiovisualProgram,
): void {
  const domain = controlBindingDomain(binding, program);
  assert(sameTemporalDomain(domain, controlDomain),
    `Control binding resolves ${domain.id}, not Control domain ${controlDomain.id}.`);
}

function occurrenceControlMap(
  program: AudiovisualProgram,
  occurrenceId: string,
): TemporalMap {
  const occurrence = program.occurrences[occurrenceId];
  assert(occurrence !== undefined, `Control binding references missing Occurrence ${occurrenceId}.`);
  const parentRange = occurrenceParentRange(occurrence);
  return sealTemporalMap({ stages: [{
    target: structuredClone(program.domain),
    source: structuredClone(occurrence.domain),
    pieces: [{
      target: parentRange,
      sourceAtStart: structuredClone(occurrence.placement.active.start),
      rate: { numerator: 1, denominator: 1 },
    }],
  }] });
}

/**
 * Close a Control binding as one exact Programme-to-Control relation.
 * Continuous terminals consume this Map; point evaluation is only one projection of it.
 */
export function temporalControlBindingMap(
  controlDomain: LocalTemporalDomain,
  binding: TemporalControlBinding,
  program: AudiovisualProgram,
): TemporalMap {
  assertTemporalControlBinding(controlDomain, binding, program);
  switch (binding.kind) {
    case "program": return identityTemporalMap(program.domain);
    case "occurrence": return occurrenceControlMap(program, binding.occurrence);
    case "source": {
      const occurrence = program.occurrences[binding.occurrence]!;
      const selection = occurrence.selections[binding.output]!;
      assert(selection.kind === "signal",
        `Control binding Source output ${binding.output} is constant and has no temporal Mapping.`);
      return composeTemporalMaps(
        occurrenceControlMap(program, binding.occurrence),
        selection.mapping,
      );
    }
    case "mapping": return structuredClone(binding.mapping);
  }
}

export function resolveTemporalControlPosition(
  controlDomain: LocalTemporalDomain,
  binding: TemporalControlBinding,
  program: AudiovisualProgram,
  at: ExactTemporalValue,
): ExactTemporalValue | undefined {
  const resolved = evaluateTemporalMap(
    temporalControlBindingMap(controlDomain, binding, program),
    at,
    "after",
  );
  return resolved?.position;
}

function assertSpatialMapInterpolation(value: SpatialMapInterpolation, label: string): void {
  assert(value.kind === "affine-linear", `${label}.kind is invalid.`);
}

export function assertSpatialMapControl(value: SpatialMapControl): void {
  assertTemporalControl(value, (map, label) => {
    try { assertSpatialMap(map); } catch (error) {
      throw new Error(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, assertSpatialMapInterpolation);
  const maps = value.segments.flatMap((segment) => [segment.from, segment.to]);
  const first = maps[0]!;
  for (const map of maps.slice(1)) {
    assert(sameSpatialDomain(map.target, first.target),
      `Spatial Map Control changes target domain ${first.target.id} to ${map.target.id}.`);
    assert(sameSpatialDomain(map.source, first.source),
      `Spatial Map Control changes source domain ${first.source.id} to ${map.source.id}.`);
  }
}

export function spatialMapControlDomains(value: SpatialMapControl): {
  readonly target: LocalSpatialDomain;
  readonly source: LocalSpatialDomain;
} {
  assertSpatialMapControl(value);
  const first = value.segments[0]!.from;
  return { target: structuredClone(first.target), source: structuredClone(first.source) };
}

function unitNumber(value: Rational): number {
  const scale = 1_000_000_000_000_000n;
  return Number(value.numerator * scale / value.denominator) / Number(scale);
}

export function evaluateSpatialMapControl(
  value: SpatialMapControl,
  at: ExactTemporalValue,
): SpatialMap {
  assertSpatialMapControl(value);
  return evaluateTemporalControl(value, at, (from, to, progress, interpolation) => {
    assertSpatialMapInterpolation(interpolation, "Spatial Map Control interpolation");
    return interpolateSpatialMaps(from, to, unitNumber(progress));
  });
}

export function evaluateBoundSpatialMapControl(
  value: SpatialMapControl,
  binding: TemporalControlBinding,
  program: AudiovisualProgram,
  at: ExactTemporalValue,
): SpatialMap | undefined {
  assertSpatialMapControl(value);
  const position = resolveTemporalControlPosition(value.domain, binding, program, at);
  return position === undefined ? undefined : evaluateSpatialMapControl(value, position);
}

export function sealSpatialMapControl(value: SpatialMapControl): SpatialMapControl {
  assertSpatialMapControl(value);
  return structuredClone(value);
}
