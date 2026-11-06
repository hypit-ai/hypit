import assert from "node:assert/strict";
import test from "node:test";

import {
  pictureType,
  sealAudiovisualProgram,
  sealOccurrence,
  type AudiovisualProgram,
  type ProgramSource,
} from "@hypit/audiovisual";
import { sealLocalSpatialDomain, sealSpatialMap } from "@hypit/spatial/algebra";
import {
  exactTemporalValue,
  sealLocalTemporalDomain,
  sealTemporalMap,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

import { evaluateAudiovisualProgramFrame, outputFrameCount } from "../src/index.js";

const seconds = (value: number): ExactTemporalValue =>
  exactTemporalValue({ numerator: BigInt(value), denominator: 1n });

function fixture(): AudiovisualProgram {
  const programTime = sealLocalTemporalDomain({ id: "program:time", duration: seconds(12) });
  const sourceTime = sealLocalTemporalDomain({ id: "source:time", duration: seconds(12) });
  const programSpace = sealLocalSpatialDomain({
    id: "program:space", region: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  const sourceSpace = sealLocalSpatialDomain({
    id: "source:space", region: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  const source: ProgramSource = { id: "source", outputs: { picture: {
    kind: "signal", type: pictureType, domain: sourceTime, spatialDomain: sourceSpace,
  } } };
  const occurrenceTime = sealLocalTemporalDomain({ id: "source-use:time", duration: seconds(12) });
  const occurrence = sealOccurrence({
    id: "source-use",
    source,
    domain: occurrenceTime,
    placement: {
      parent: programTime,
      start: seconds(0),
      active: { start: seconds(0), end: seconds(12) },
    },
    selections: { picture: { kind: "signal", mapping: sealTemporalMap({ stages: [{
      target: occurrenceTime,
      source: sourceTime,
      pieces: [{
        target: { start: seconds(0), end: seconds(12) },
        sourceAtStart: seconds(0),
        rate: { numerator: 1, denominator: 1 },
      }],
    }] }) } },
  });
  return sealAudiovisualProgram({
    id: "program",
    domain: programTime,
    pictureDomain: programSpace,
    occurrences: { "source-use": occurrence },
    picture: { root: "placed", nodes: {
      source: { kind: "use", occurrence: "source-use", output: "picture" },
      placed: { kind: "remap", input: "source", mapping: sealSpatialMap({
        target: programSpace,
        source: sourceSpace,
        transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
      }) },
    } },
  });
}

test("output sampling chooses exact positions without changing the Programme", () => {
  const program = fixture();
  const before = structuredClone(program);
  const twentyFour = { frameRate: { numerator: 24, denominator: 1 } };
  const ntsc = { frameRate: { numerator: 30_000, denominator: 1_001 } };

  assert.equal(outputFrameCount(program.domain.duration, twentyFour), 288);
  assert.equal(outputFrameCount(program.domain.duration, ntsc), 360);

  const evaluated = evaluateAudiovisualProgramFrame(program, twentyFour, 72);
  assert.equal(evaluated.frameCount, 288);
  assert.deepEqual(evaluated.evaluation.at, seconds(3));
  assert.equal(evaluated.evaluation.picture?.nodes.source?.kind, "sample");
  assert.deepEqual(program, before);
  assert.throws(() => evaluateAudiovisualProgramFrame(program, twentyFour, 288), /outside/u);
});
