import assert from "node:assert/strict";
import test from "node:test";

import { evaluateTemporalMap, exactTemporalValue, sealLocalTemporalDomain, sealTemporalMap } from "@hypit/temporal/algebra";
import type { ExactTemporalValue, LocalTemporalDomain, TemporalMap, TemporalRate } from "@hypit/temporal/algebra";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";

import {
  moveOccurrence,
  occurrenceParentRange,
  pictureType,
  remapOccurrence,
  sealOccurrence,
  splitOccurrence,
  trimOccurrence,
} from "../src/index.js";
import type { Occurrence, ProgramSource } from "../src/index.js";

const seconds = (numerator: number, denominator = 1): ExactTemporalValue => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});
const domain = (id: string, duration: number): LocalTemporalDomain => sealLocalTemporalDomain({ id, duration: seconds(duration) });
function affineMap(input: { target: LocalTemporalDomain; source: LocalTemporalDomain;
  sourceAtStart: ExactTemporalValue; rate?: TemporalRate }): TemporalMap {
  return sealTemporalMap({ stages: [{ target: input.target, source: input.source, pieces: [{
    target: { start: seconds(0), end: input.target.duration }, sourceAtStart: input.sourceAtStart,
    rate: input.rate ?? { numerator: 1, denominator: 1 },
  }] }] });
}

const parent = domain("main:time", 20);
const local = domain("shot-01:time", 10);
const pictureDomain = domain("interview:picture-time", 30);
const pictureSpace = sealLocalSpatialDomain({
  id: "interview:picture-space",
  region: { x: 0, y: 0, width: 1920, height: 1080 },
});
const source: ProgramSource = { id: "interview", outputs: { picture: {
  kind: "signal",
  type: pictureType,
  domain: pictureDomain,
  spatialDomain: pictureSpace,
} } };
function fixture(): Occurrence {
  return sealOccurrence({
    id: "shot-01", source, domain: local,
    placement: { parent, start: seconds(3), active: { start: seconds(0), end: seconds(10) } },
    selections: { picture: { kind: "signal", mapping: affineMap({ target: local, source: pictureDomain, sourceAtStart: seconds(5) }) } },
  });
}

test("Move changes only parent placement", () => {
  const original = fixture();
  const moved = moveOccurrence(original, seconds(6));
  assert.deepEqual(occurrenceParentRange(moved), { start: seconds(6), end: seconds(16) });
  assert.deepEqual(moved.selections, original.selections);
  assert.deepEqual(moved.placement.active, original.placement.active);
});

test("Trim preserves the parent position of retained occurrence-local content", () => {
  const original = fixture();
  const trimmed = trimOccurrence(original, { start: seconds(2), end: seconds(8) });
  assert.deepEqual(trimmed.placement.active, { start: seconds(2), end: seconds(8) });
  assert.deepEqual(occurrenceParentRange(trimmed), { start: seconds(5), end: seconds(11) });
  assert.deepEqual(trimmed.selections, original.selections);
});

test("Remap changes one Source output without moving the shared occurrence", () => {
  const original = fixture();
  const slipped = remapOccurrence(original, "picture",
    affineMap({ target: local, source: pictureDomain, sourceAtStart: seconds(7) }));
  assert.deepEqual(slipped.placement, original.placement);
  assert.equal(slipped.selections.picture?.kind, "signal");
  assert.equal(original.selections.picture?.kind, "signal");
  assert.deepEqual(evaluateTemporalMap(slipped.selections.picture.mapping, seconds(0), "after")?.position, seconds(7));
  assert.deepEqual(evaluateTemporalMap(original.selections.picture.mapping, seconds(0), "after")?.position, seconds(5));
});

test("Split creates two explicit identities over one multi-output Source", () => {
  const original = fixture();
  const [left, right] = splitOccurrence(original, { at: seconds(4), leftId: "shot-01-a", rightId: "shot-01-b" });
  assert.deepEqual(occurrenceParentRange(left), { start: seconds(3), end: seconds(7) });
  assert.deepEqual(occurrenceParentRange(right), { start: seconds(7), end: seconds(13) });
  assert.deepEqual(left.selections, original.selections);
  assert.deepEqual(right.source, original.source);
});

test("Reverse, hold and piecewise variable speed remain ordinary Temporal Maps", () => {
  const reverse = affineMap({ target: local, source: pictureDomain, sourceAtStart: seconds(15),
    rate: { numerator: -1, denominator: 1 } });
  const hold = affineMap({ target: local, source: pictureDomain, sourceAtStart: seconds(10),
    rate: { numerator: 0, denominator: 1 } });
  const variable = sealTemporalMap({ stages: [{ target: local, source: pictureDomain, pieces: [
    { target: { start: seconds(0), end: seconds(5) }, sourceAtStart: seconds(0), rate: { numerator: 1, denominator: 1 } },
    { target: { start: seconds(5), end: seconds(10) }, sourceAtStart: seconds(5), rate: { numerator: 2, denominator: 1 } },
  ] }] });
  for (const map of [reverse, hold, variable]) assert.doesNotThrow(() => remapOccurrence(fixture(), "picture", map));
  assert.deepEqual(evaluateTemporalMap(reverse, seconds(2), "after")?.position, seconds(13));
  assert.deepEqual(evaluateTemporalMap(hold, seconds(8), "after")?.position, seconds(10));
  assert.deepEqual(evaluateTemporalMap(variable, seconds(7), "after")?.position, seconds(9));
});

test("Occurrence rejects placement and Mapping outside explicit domains", () => {
  const original = fixture();
  assert.throws(() => moveOccurrence(original, seconds(11)), /outside parent domain/u);
  assert.throws(() => trimOccurrence(original, { start: seconds(9), end: seconds(11) }), /outside domain/u);
  const other = domain("other:time", 10);
  assert.throws(() => remapOccurrence(original, "picture",
    affineMap({ target: other, source: pictureDomain, sourceAtStart: seconds(0) })),
  /must begin in occurrence domain/u);
});

test("a constant Source output borrows only Occurrence duration and owns no fake Mapping", () => {
  const still: ProgramSource = { id: "poster", outputs: { picture: {
    kind: "constant",
    type: pictureType,
    spatialDomain: pictureSpace,
  } } };
  const use = sealOccurrence({
    id: "poster-use",
    source: still,
    domain: local,
    placement: { parent, start: seconds(3), active: { start: seconds(0), end: seconds(10) } },
    selections: { picture: { kind: "constant" } },
  });
  assert.deepEqual(use.selections, { picture: { kind: "constant" } });
  assert.doesNotThrow(() => moveOccurrence(use, seconds(6)));
  assert.throws(() => remapOccurrence(use, "picture",
    affineMap({ target: local, source: pictureDomain, sourceAtStart: seconds(0) })),
  /constant and cannot be remapped/u);
});
