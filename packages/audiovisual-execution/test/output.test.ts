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

import {
  bindAudiovisualPictureExecution,
  createAudiovisualPictureDemand,
  evaluateAudiovisualProgramFrame,
  executeAudiovisualPicture,
  outputFrameCount,
  partitionAudiovisualPictureExecution,
  prepareAudiovisualPictureExecution,
  type AudiovisualPictureOutput,
} from "../src/index.js";

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

test("Picture output sampling and execution do not select a renderer", async () => {
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

  const output: AudiovisualPictureOutput = {
    id: "preview",
    sampling: twentyFour,
    canvas: { width: 1920, height: 1080, clearColor: "#000000" },
    pictureMapping: sealSpatialMap({
      target: sealLocalSpatialDomain({
        id: "preview:viewport", region: { x: 0, y: 0, width: 1920, height: 1080 },
      }),
      source: program.pictureDomain!,
      transform: { kind: "affine", xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 },
    }),
  };
  const demand = createAudiovisualPictureDemand(program, output);
  assert.equal(demand.samples?.length, 288);
  assert.deepEqual(demand.samples?.[72]?.position, seconds(3));

  const prepared = prepareAudiovisualPictureExecution(program, output);
  const capability = {
    terminal: "example-picture-root",
    finalOutputs: ["picture" as const],
    verifyBinding() {},
    inputRepresentations: () => [] as readonly string[],
    outputRepresentations: () => [] as readonly string[],
  };
  const rootBindings = [
    ...prepared.demandPlan.nodes.map(node => ({ node: node.id, terminal: "example-picture-root" })),
    ...prepared.demandPlan.sourceTasks.map(source => ({
      node: source.id,
      terminal: "example-picture-root",
      sourceAccess: source.temporal.kind === "constant"
        ? { kind: "constant" as const }
        : { kind: "point" as const },
    })),
  ];
  assert.throws(() => partitionAudiovisualPictureExecution(prepared, rootBindings, []),
    /no capability offer/u);
  const partitioned = partitionAudiovisualPictureExecution(prepared, rootBindings, [capability]);
  assert(partitioned.execution.terminalBindings.every((binding) =>
    binding.terminal === "example-picture-root"));
  assert.equal("productBindings" in partitioned.execution, false);
  const plan = bindAudiovisualPictureExecution(partitioned, []);
  assert.deepEqual(plan.execution.productBindings, []);
  const rendered = await executeAudiovisualPicture<never, { readonly renderer: string }>(plan, [{
    capability,
    executor: {
      terminal: "example-picture-root",
      async execute(request) {
        assert.deepEqual(request.finalOutputs, ["picture"]);
        return { products: [], outputs: { picture: { renderer: "example-picture-root" } } };
      },
    },
  }]);
  assert.deepEqual(rendered, { renderer: "example-picture-root" });

  const split = partitionAudiovisualPictureExecution(prepared, [
    ...prepared.demandPlan.nodes.map(node => ({ node: node.id, terminal: "consumer" })),
    ...prepared.demandPlan.sourceTasks.map(source => ({
      node: source.id,
      terminal: "producer",
      sourceAccess: { kind: "point" as const },
    })),
  ], [{
    terminal: "producer",
    finalOutputs: [],
    verifyBinding() {},
    inputRepresentations: () => [],
    outputRepresentations: () => ["producer.frames"],
  }, {
    terminal: "consumer",
    finalOutputs: ["picture"],
    verifyBinding() {},
    inputRepresentations: () => ["consumer.frames"],
    outputRepresentations: () => [],
  }]);
  assert.equal(split.execution.products.length, 1);
  assert.throws(() => bindAudiovisualPictureExecution(split, [{
    product: split.execution.products[0]!.id,
    representation: "producer.frames",
  }]), /cannot consume producer\.frames/u);
});

