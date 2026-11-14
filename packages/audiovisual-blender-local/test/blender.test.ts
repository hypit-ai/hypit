import assert from "node:assert/strict";
import test from "node:test";

import type { PlannedSourceExecution } from "@hypit/audiovisual-execution";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal";
import { fixtureResource } from "../../../test/fixture-resource.js";

import {
  blenderFrameRate,
  blenderSceneProgram,
  readBlenderSceneProgram,
} from "../src/index.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

function task(): PlannedSourceExecution {
  const domain = sealLocalTemporalDomain({ id: "scene-time", duration: at(2) });
  return {
    task: "blender-task",
    signal: "picture",
    terminal: "blender",
    source: "scene",
    output: "picture",
    requested: { kind: "signal", regions: { domain, regions: [{
      start: { position: at(1, 2), side: "after" },
      end: { position: at(3, 2), side: "before" },
    }] } },
    samples: [
      { position: at(1, 2), side: "after" },
      { position: at(8, 15), side: "after" },
    ],
    acquisition: { kind: "range", regions: { domain, regions: [{
      start: { position: at(1, 2), side: "after" },
      end: { position: at(3, 2), side: "before" },
    }] } },
  };
}

test("a Blender scene programme keeps portable files behind ordinary Artifacts", () => {
  const artifact = {
    kind: "blob" as const,
    resource: fixtureResource("blender:scene"),
    size: 42,
    mediaType: "text/x-python",
  };
  const program = blenderSceneProgram({ entry: "scene.py", files: [{ path: "scene.py", artifact }] });
  assert.equal(program.format, "hypit.blender-python-scene@1");
  assert.deepEqual(readBlenderSceneProgram(program), {
    entry: "scene.py",
    files: [{ path: "scene.py", artifact }],
  });
});

test("frame-independent Blender range execution derives its exact non-zero grid", () => {
  assert.deepEqual(blenderFrameRate(task(), 120), { numerator: 30, denominator: 1 });
  assert.deepEqual(blenderFrameRate({
    ...task(),
    samples: [
      { position: at(0), side: "after" },
      { position: at(1001, 30_000), side: "after" },
    ],
  }, 120), { numerator: 30_000, denominator: 1_001 });
});

