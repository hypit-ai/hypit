import assert from "node:assert/strict";
import test from "node:test";

import {
  exactTemporalValue,
  evaluateTemporalMap,
  sealLocalTemporalDomain,
  sealTemporalMap,
  type ExactTemporalValue,
  type LocalTemporalDomain,
  type TemporalMap,
} from "@hypit/temporal/algebra";
import {
  sealLocalSpatialDomain,
  sealSpatialMap,
  type LocalSpatialDomain,
  type SpatialMap,
} from "@hypit/spatial/algebra";

import {
  evaluateAudiovisualProgramAt,
  evaluateTemporalControl,
  pictureType,
  pointwiseOperatorTemporalSupport,
  sealAudiovisualProgram,
  sealOccurrence,
  sealSpatialMapControl,
  temporalControlBindingMap,
} from "../src/index.js";
import type {
  AudiovisualProgram,
  Occurrence,
  ProgramSource,
  SpatialMapControl,
  TemporalControl,
  TemporalControlBinding,
} from "../src/index.js";

const seconds = (numerator: number, denominator = 1): ExactTemporalValue => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});
const time = (id: string, duration: number): LocalTemporalDomain =>
  sealLocalTemporalDomain({ id, duration: seconds(duration) });
const space = (id: string): LocalSpatialDomain => sealLocalSpatialDomain({
  id, region: { x: 0, y: 0, width: 1920, height: 1080 },
});
function temporalMap(
  target: LocalTemporalDomain,
  source: LocalTemporalDomain,
  sourceAtStart = seconds(0),
): TemporalMap {
  return sealTemporalMap({ stages: [{ target, source, pieces: [{
    target: { start: seconds(0), end: target.duration }, sourceAtStart,
    rate: { numerator: 1, denominator: 1 },
  }] }] });
}
function spatialMap(target: LocalSpatialDomain, source: LocalSpatialDomain, tx: number): SpatialMap {
  return sealSpatialMap({
    target, source,
    transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx, ty: 0 },
  });
}

const mainTime = time("main:time", 10);
const occurrenceTime = time("title-use:time", 6);
const sourceTime = time("title:picture-time", 20);
const mainSpace = space("main:space");
const sourceSpace = space("title:space");
const source: ProgramSource = { id: "title", outputs: { picture: {
  kind: "signal",
  type: pictureType,
  domain: sourceTime,
  spatialDomain: sourceSpace,
} } };

function occurrence(sourceAtStart = seconds(5), start = seconds(2)): Occurrence {
  return sealOccurrence({
    id: "title-use",
    source,
    domain: occurrenceTime,
    placement: {
      parent: mainTime,
      start,
      active: { start: seconds(0), end: seconds(6) },
    },
    selections: { picture: { kind: "signal", mapping: temporalMap(occurrenceTime, sourceTime, sourceAtStart) } },
  });
}

function control(domain: LocalTemporalDomain): SpatialMapControl {
  return sealSpatialMapControl({
    domain,
    segments: [{
      range: { start: seconds(0), end: domain.duration },
      from: spatialMap(mainSpace, sourceSpace, 0),
      to: spatialMap(mainSpace, sourceSpace, -600),
      interpolation: { kind: "affine-linear" },
    }],
  });
}

function program(
  motion: SpatialMapControl,
  binding: TemporalControlBinding,
  use = occurrence(),
): AudiovisualProgram {
  return sealAudiovisualProgram({
    id: "motion",
    domain: mainTime,
    pictureDomain: mainSpace,
    occurrences: { "title-use": use },
    picture: { root: "motion", nodes: {
      source: { kind: "use", occurrence: "title-use", output: "picture" },
      motion: { kind: "remap-control", input: "source", control: motion, binding },
    } },
  });
}

function evaluatedTx(value: AudiovisualProgram, at: ExactTemporalValue): number | undefined {
  const node = evaluateAudiovisualProgramAt(value, at).picture?.nodes.motion;
  return node?.kind === "remap" ? node.mapping.transform.tx : undefined;
}

test("Temporal Control leaves value interpolation to its consumer", () => {
  const value: TemporalControl<number, { readonly operation: "multiply" }> = {
    domain: time("number:time", 2),
    segments: [{
      range: { start: seconds(0), end: seconds(2) },
      from: 2,
      to: 8,
      interpolation: { operation: "multiply" },
    }],
  };
  const seen: { numerator?: bigint; denominator?: bigint; operation?: string } = {};
  const result = evaluateTemporalControl(value, seconds(1, 2), (from, to, progress, interpolation) => {
    seen.numerator = progress.numerator;
    seen.denominator = progress.denominator;
    seen.operation = interpolation.operation;
    return from + (to - from) * Number(progress.numerator) / Number(progress.denominator);
  });
  assert.equal(result, 3.5);
  assert.deepEqual(seen, { numerator: 1n, denominator: 4n, operation: "multiply" });
});

test("occurrence-local motion follows Move and ignores source Slip", () => {
  const original = program(control(occurrenceTime), { kind: "occurrence", occurrence: "title-use" });
  assert.equal(evaluatedTx(original, seconds(5)), -300);

  const moved = program(control(occurrenceTime),
    { kind: "occurrence", occurrence: "title-use" }, occurrence(seconds(5), seconds(4)));
  assert.equal(evaluatedTx(moved, seconds(7)), -300);
  assert.equal(evaluatedTx(moved, seconds(3)), undefined);

  const slipped = program(control(occurrenceTime),
    { kind: "occurrence", occurrence: "title-use" }, occurrence(seconds(7)));
  assert.equal(evaluatedTx(slipped, seconds(5)), -300);
});

test("source-local motion follows Slip while Move only relocates its occurrence", () => {
  const original = program(control(sourceTime), {
    kind: "source", occurrence: "title-use", output: "picture",
  });
  assert.equal(evaluatedTx(original, seconds(5)), -240);

  const slipped = program(control(sourceTime),
    { kind: "source", occurrence: "title-use", output: "picture" }, occurrence(seconds(7)));
  assert.equal(evaluatedTx(slipped, seconds(5)), -300);

  const moved = program(control(sourceTime),
    { kind: "source", occurrence: "title-use", output: "picture" }, occurrence(seconds(5), seconds(4)));
  assert.equal(evaluatedTx(moved, seconds(7)), -240);
});

test("program-local motion stays at its absolute parent position", () => {
  const original = program(control(mainTime), { kind: "program" });
  assert.equal(evaluatedTx(original, seconds(5)), -300);

  const moved = program(control(mainTime), { kind: "program" }, occurrence(seconds(5), seconds(4)));
  assert.equal(evaluatedTx(moved, seconds(5)), -300);
  assert.equal(evaluatedTx(moved, seconds(7)), -420);

  const slipped = program(control(mainTime), { kind: "program" }, occurrence(seconds(7)));
  assert.equal(evaluatedTx(slipped, seconds(5)), -300);
});

test("every Control binding closes as one Programme-to-Control Temporal Map", () => {
  const occurrenceBound = program(control(occurrenceTime), {
    kind: "occurrence", occurrence: "title-use",
  });
  const occurrenceMap = temporalControlBindingMap(occurrenceTime, {
    kind: "occurrence", occurrence: "title-use",
  }, occurrenceBound);
  assert.equal(evaluateTemporalMap(occurrenceMap, seconds(1), "after"), undefined);
  assert.deepEqual(evaluateTemporalMap(occurrenceMap, seconds(5), "after")?.position, seconds(3));

  const sourceBound = program(control(sourceTime), {
    kind: "source", occurrence: "title-use", output: "picture",
  });
  const sourceMap = temporalControlBindingMap(sourceTime, {
    kind: "source", occurrence: "title-use", output: "picture",
  }, sourceBound);
  assert.deepEqual(evaluateTemporalMap(sourceMap, seconds(5), "after")?.position, seconds(8));

  const moved = program(control(sourceTime), {
    kind: "source", occurrence: "title-use", output: "picture",
  }, occurrence(seconds(5), seconds(4)));
  const movedMap = temporalControlBindingMap(sourceTime, {
    kind: "source", occurrence: "title-use", output: "picture",
  }, moved);
  assert.deepEqual(evaluateTemporalMap(movedMap, seconds(7), "after")?.position, seconds(8));

  const programMap = temporalControlBindingMap(mainTime, { kind: "program" },
    program(control(mainTime), { kind: "program" }));
  assert.deepEqual(evaluateTemporalMap(programMap, seconds(5), "after")?.position, seconds(5));

  const explicit = temporalMap(mainTime, sourceTime, seconds(5));
  const mapped = temporalControlBindingMap(sourceTime, { kind: "mapping", mapping: explicit },
    program(control(sourceTime), { kind: "mapping", mapping: explicit }));
  assert.deepEqual(mapped, explicit);
});

test("an apply with an unavailable required Control evaluates to the signal bottom", () => {
  const value = sealAudiovisualProgram({
    id: "controlled-picture",
    domain: mainTime,
    pictureDomain: mainSpace,
    occurrences: { "title-use": occurrence() },
    picture: { root: "effect", nodes: {
      source: { kind: "use", occurrence: "title-use", output: "picture" },
      placed: { kind: "remap", input: "source", mapping: spatialMap(mainSpace, sourceSpace, 0) },
      effect: {
        kind: "apply",
        operator: {
          id: "project:controlled-picture",
          inputs: ["picture"],
          temporalControls: { motion: occurrenceTime },
          temporalSupport: pointwiseOperatorTemporalSupport(["picture"]),
          program: { format: "project.controlled-picture@1", payload: {}, artifacts: [] },
        },
        inputs: { picture: "placed" },
        controlBindings: { motion: { kind: "occurrence", occurrence: "title-use" } },
      },
    } },
  });
  assert.deepEqual(evaluateAudiovisualProgramAt(value, seconds(1)).picture?.nodes.effect,
    { kind: "transparent" });
  const active = evaluateAudiovisualProgramAt(value, seconds(5)).picture?.nodes.effect;
  assert.equal(active?.kind, "apply");
  if (active?.kind === "apply") assert.deepEqual(active.controlPositions.motion, seconds(3));
});

test("Control bindings reject an implicit or mismatched Domain", () => {
  assert.throws(() => program(control(occurrenceTime), { kind: "program" }),
    /resolves main:time, not Control domain title-use:time/u);
  assert.throws(() => sealSpatialMapControl({
    domain: occurrenceTime,
    segments: [{
      range: { start: seconds(1), end: seconds(6) },
      from: spatialMap(mainSpace, sourceSpace, 0),
      to: spatialMap(mainSpace, sourceSpace, -600),
      interpolation: { kind: "affine-linear" },
    }],
  }), /previous segment boundary/u);
});
