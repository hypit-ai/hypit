import {
  addExactTemporalValues,
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  assertTemporalMap,
  compareExactTemporalValues,
  subtractExactTemporalValues,
} from "@hypit/temporal/algebra";
import type {
  ExactTemporalValue,
  LocalTemporalDomain,
  TemporalRange,
} from "@hypit/temporal/algebra";
import { isTypeRef, sameType } from "@hypit/module";
import { assertLocalSpatialDomain } from "@hypit/spatial/algebra";

import { pictureType } from "./identity.js";
import { assertSignalReconstruction } from "./operator.js";

import type {
  Occurrence,
  OccurrencePlacement,
  ProgramSource,
} from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertIdentity(value: string, label: string): void {
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value), `${label} is invalid.`);
}

function sameDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id
    && compareExactTemporalValues(left.duration, right.duration) === 0;
}

function assertRange(range: TemporalRange, domain: LocalTemporalDomain, label: string): void {
  assertExactTemporalValue(range.start, `${label}.start`);
  assertExactTemporalValue(range.end, `${label}.end`);
  assert(compareExactTemporalValues(range.start, range.end) < 0, `${label} must be non-empty.`);
  assert(compareExactTemporalValues(range.start, { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) >= 0
    && compareExactTemporalValues(range.end, domain.duration) <= 0,
  `${label} lies outside domain ${domain.id}.`);
}

function rangeDuration(range: TemporalRange): ExactTemporalValue {
  return subtractExactTemporalValues(range.end, range.start);
}

export function assertProgramSource(value: ProgramSource): void {
  assertIdentity(value.id, "ProgramSource.id");
  const outputs = Object.entries(value.outputs);
  assert(outputs.length > 0, `ProgramSource ${value.id} has no outputs.`);
  for (const [name, output] of outputs) {
    assertIdentity(name, `ProgramSource ${value.id} output`);
    assert(isTypeRef(output.type), `ProgramSource ${value.id}.${name} Type is invalid.`);
    assert(output.kind === "signal" || output.kind === "constant",
      `ProgramSource ${value.id}.${name} kind is invalid.`);
    if (output.kind === "signal") assertLocalTemporalDomain(output.domain);
    if (output.spatialDomain !== undefined) assertLocalSpatialDomain(output.spatialDomain);
    if (sameType(output.type, pictureType)) {
      assert(output.spatialDomain !== undefined,
        `ProgramSource ${value.id}.${name} Picture has no spatial domain.`);
    }
  }
}

export function occurrenceParentRange(value: Pick<Occurrence, "domain" | "placement">): TemporalRange {
  assertLocalTemporalDomain(value.domain);
  assertRange(value.placement.active, value.domain, "OccurrencePlacement.active");
  assertExactTemporalValue(value.placement.start, "OccurrencePlacement.start");
  return {
    start: structuredClone(value.placement.start),
    end: addExactTemporalValues(value.placement.start, rangeDuration(value.placement.active)),
  };
}

export function assertOccurrencePlacement(
  value: OccurrencePlacement,
  occurrenceDomain: LocalTemporalDomain,
): void {
  assertLocalTemporalDomain(value.parent);
  assertLocalTemporalDomain(occurrenceDomain);
  assertRange(value.active, occurrenceDomain, "OccurrencePlacement.active");
  const parentRange = occurrenceParentRange({ domain: occurrenceDomain, placement: value });
  assert(compareExactTemporalValues(parentRange.start,
    { ticks: "0", timeBase: { numerator: 1, denominator: 1 } }) >= 0
    && compareExactTemporalValues(parentRange.end, value.parent.duration) <= 0,
  `Occurrence placement lies outside parent domain ${value.parent.id}.`);
}

export function assertOccurrence(value: Occurrence): void {
  assertIdentity(value.id, "Occurrence.id");
  assertProgramSource(value.source);
  assertLocalTemporalDomain(value.domain);
  assertOccurrencePlacement(value.placement, value.domain);
  const selections = Object.entries(value.selections);
  assert(selections.length > 0, `Occurrence ${value.id} selects no Source outputs.`);
  for (const [name, selection] of selections) {
    const output = Object.hasOwn(value.source.outputs, name) ? value.source.outputs[name] : undefined;
    assert(output !== undefined, `Occurrence ${value.id} selects unknown Source output ${name}.`);
    assert(selection.kind === output.kind,
      `Occurrence ${value.id}.${name} selects ${selection.kind}, but Source output is ${output.kind}.`);
    if (selection.kind === "constant") continue;
    assert(output.kind === "signal", `Occurrence ${value.id}.${name} signal has no Source Domain.`);
    assertTemporalMap(selection.mapping);
    const first = selection.mapping.stages[0];
    const last = selection.mapping.stages.at(-1);
    assert(first !== undefined && sameDomain(first.target, value.domain),
      `Occurrence ${value.id}.${name} Mapping must begin in occurrence domain ${value.domain.id}.`);
    assert(last !== undefined && sameDomain(last.source, output.domain),
      `Occurrence ${value.id}.${name} Mapping must end in Source output domain ${output.domain.id}.`);
    if (selection.reconstruction !== undefined) {
      assertSignalReconstruction(selection.reconstruction,
        `Occurrence ${value.id}.${name} reconstruction`);
      assert(sameType(selection.reconstruction.signal, output.type),
        `Occurrence ${value.id}.${name} reconstruction targets another signal Type.`);
    }
  }
}

export function sealOccurrence(value: Occurrence): Occurrence {
  assertOccurrence(value);
  return structuredClone(value);
}
