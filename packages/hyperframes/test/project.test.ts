import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { compileHyperframesDocument } from "../src/document.js";
import { stageHyperframesProject } from "../src/project.js";
import { sealComposition, sealVisualTrack } from "@hypit/composition";
import { sealProgramSpace } from "@hypit/program-space";

test("staging cancels and joins sibling reads before exposing a failure", async () => {
  const space = sealProgramSpace({ id: "space", durationSec: 1,
    frameRate: { numerator: 30, denominator: 1 } });
  const track = sealVisualTrack({ id: "images", visualIr: "hypit.visual-ir@1", programSpaceId: space.id,
    presents: ["a", "b"].map((id, order) => ({ id, span: { startFrame: 0, endFrameExclusive: 30 }, stacking: { order, tieBreak: id },
      elements: [{ id, order: 0, kind: "image" as const, style: [],
        artifact: { kind: "blob" as const, resource: `res_${id}` as const, size: 1, mediaType: "image/png" } }],
    })) });
  const document = compileHyperframesDocument(sealComposition({ id: "main", canvas: { width: 64, height: 64, clearColor: "#000000" }, tracks: [track] }), space);
  const directory = await mkdtemp(join(tmpdir(), "hypit-stage-cancel-"));
  let active = 0;
  try {
    await assert.rejects(stageHyperframesProject({ document, directory, read: async (artifact, signal) => {
      active++;
      try {
        if (artifact.resource === "res_a") { await delay(10); throw new Error("source unavailable"); }
        await delay(60_000, undefined, { signal });
        return new Uint8Array([0]);
      } finally { active--; }
    } }), /source unavailable/u);
    assert.equal(active, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
