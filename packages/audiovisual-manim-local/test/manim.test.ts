import assert from "node:assert/strict";
import test from "node:test";

import type { PlannedSourceExecution } from "@hypit/audiovisual-execution";
import { MemoryResourceStore } from "@hypit/resource-store";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  createLocalManimNlePictureTerminalFacet,
  manimFrameRate,
  manimSceneProgram,
  readManimSceneProgram,
} from "../src/index.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

function task(
  samples: PlannedSourceExecution["samples"],
  end = at(2),
): PlannedSourceExecution {
  const domain = sealLocalTemporalDomain({ id: "scene-time", duration: at(2) });
  return {
    task: "manim-task",
    signal: "picture",
    terminal: "manim",
    source: "scene",
    output: "picture",
    requested: { kind: "signal", regions: { domain, regions: [{
      start: { position: at(0), side: "after" },
      end: { position: at(2), side: "before" },
    }] } },
    ...(samples === undefined ? {} : { samples }),
    acquisition: { kind: "sequential", origin: at(0), execution: { domain, regions: [{
      start: { position: at(0), side: "after" },
      end: { position: end, side: "before" },
    }] } },
  };
}

test("a Manim scene programme keeps portable files behind ordinary Artifacts", () => {
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("manim:scene"),
    size: 42,
    mediaType: "text/x-python",
  };
  const program = manimSceneProgram({
    scene: "HypitScene",
    entry: "scene.py",
    files: [{ path: "scene.py", artifact }],
  });
  assert.equal(program.format, "hypit.manim-scene@1");
  assert.deepEqual(readManimSceneProgram(program), {
    scene: "HypitScene",
    entry: "scene.py",
    files: [{ path: "scene.py", artifact }],
  });
});

test("Manim execution derives one exact bounded grid from Source-local observations", () => {
  const request = task([
    { position: at(0), side: "after" },
    { position: at(1, 30), side: "after" },
    { position: at(2, 30), side: "after" },
  ]);
  assert.deepEqual(manimFrameRate(request, 120), { numerator: 30, denominator: 1 });
  assert.deepEqual(manimFrameRate(task([
    { position: at(0), side: "after" },
  ], at(1, 24)), 120), { numerator: 24, denominator: 1 },
  "the sequential execution boundary participates in the exact frame grid");
  assert.deepEqual(manimFrameRate(task([
    { position: at(0), side: "after" },
    { position: at(1001, 30_000), side: "after" },
  ]), 120), { numerator: 30_000, denominator: 1_001 });
});

test("a component package can contribute its named local Manim Terminal execution", () => {
  const program = manimSceneProgram({
    scene: "HypitScene",
    entry: "scene.py",
    files: [{
      path: "scene.py",
      artifact: {
        kind: "blob",
        resource: fixtureResource("manim:facet-scene"),
        size: 42,
        mediaType: "text/x-python",
      },
    }],
  });
  const facet = createLocalManimNlePictureTerminalFacet({
    terminal: "example.manim",
    pythonPath: "/fixture/python",
    ffprobePath: "/fixture/ffprobe",
  });
  const selected = facet.implementation.create({
    sources: [{
      source: "scene",
      output: "picture",
      terminal: "example.manim",
      sourceAccess: { kind: "sequential", origin: at(0) },
      representation: "example.transparent-picture",
      program,
    }],
    resources: new MemoryResourceStore(),
  });
  assert.equal(facet.address, "example.manim");
  assert.equal(selected.capability.terminal, "example.manim");
  assert.equal(selected.executor.terminal, "example.manim");
});
