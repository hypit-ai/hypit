import {
  addExactTemporalValues,
  assertExactTemporalValue,
  assertLocalTemporalDomain,
  assertTemporalMap,
  compareExactTemporalValues,
  exactTemporalZero,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type TemporalMap,
  type TemporalRange,
} from "@hypit/temporal/algebra";
import { assertIdentity } from "@hypit/nle";
import { assertHtmlPictureReconstruction } from "@hypit/html-program";
import { assertLocalSpatialDomain } from "./spatial.js";
import type { Occurrence, OccurrencePlacement } from "./types.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sameDomain(left: LocalTemporalDomain, right: LocalTemporalDomain): boolean {
  return left.id === right.id && compareExactTemporalValues(left.duration, right.duration) === 0;
}

function assertRange(range: TemporalRange, domain: LocalTemporalDomain, label: string): void {
  assertExactTemporalValue(range.start, `${label}.start`);
  assertExactTemporalValue(range.end, `${label}.end`);
  assert(compareExactTemporalValues(range.start, range.end) < 0, `${label} must be non-empty.`);
  assert(compareExactTemporalValues(range.start, exactTemporalZero()) >= 0
    && compareExactTemporalValues(range.end, domain.duration) <= 0,
  `${label} lies outside domain ${domain.id}.`);
}

function rangeDuration(range: TemporalRange): ExactTemporalValue {
  return subtractExactTemporalValues(range.end, range.start);
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

export function assertOccurrencePlacement(value: OccurrencePlacement, occurrenceDomain: LocalTemporalDomain): void {
  assertLocalTemporalDomain(value.parent);
  assertLocalTemporalDomain(occurrenceDomain);
  assertRange(value.active, occurrenceDomain, "OccurrencePlacement.active");
  const parentRange = occurrenceParentRange({ domain: occurrenceDomain, placement: value });
  assert(compareExactTemporalValues(parentRange.start, exactTemporalZero()) >= 0
    && compareExactTemporalValues(parentRange.end, value.parent.duration) <= 0,
  `Occurrence placement lies outside parent domain ${value.parent.id}.`);
}

export function assertOccurrence(value: Occurrence): void {
  assertIdentity(value.id, "Occurrence.id");
  assertOccurrencePlacement(value.placement, value.domain);
  assert(value.picture !== undefined || value.audio !== undefined, `Occurrence ${value.id} has no output.`);
  if (value.picture !== undefined) {
    assertLocalSpatialDomain(value.picture.spatialDomain);
    if (value.picture.itemTime !== undefined) {
      assertIdentity(value.picture.itemTime.name, `Occurrence ${value.id} Item time Control`);
      assertSourceMapping(value.picture.itemTime.mapping, value.domain, value.id);
    }
    if (value.picture.kind === "signal") {
      assertSourceMapping(value.picture.mapping, value.domain, value.id);
      if (value.picture.reconstruction !== undefined) {
        assert(value.content.kind === "media", `Occurrence ${value.id} reconstruction requires a Media Picture.`);
        assertHtmlPictureReconstruction(value.picture.reconstruction);
      }
    }
  }
  if (value.audio !== undefined) {
    assert(value.content.kind === "media", `Occurrence ${value.id} Audio requires Media.`);
    assertSourceMapping(value.audio, value.domain, value.id);
  }
}

function assertSourceMapping(mapping: TemporalMap, domain: LocalTemporalDomain, id: string): void {
  assertTemporalMap(mapping);
  assert(sameDomain(mapping.stages[0]!.target, domain),
    `Occurrence ${id} mapping must begin in occurrence domain ${domain.id}.`);
}
