import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { MemoryResourceStore } from "@hypit/executor";
import { rasterizeHtmlFrames } from "../../src/index.js";
import { htmlFrameFixture } from "../frames-scenario.js";

const testBrowser = process.env.HYPIT_TEST_CHROME_PATH;

test("snapshot captures original html-visual frames without video encoding", async () => {
  const resources = new MemoryResourceStore();
  const document = htmlFrameFixture();
  const phases: string[] = [];
  const images = await rasterizeHtmlFrames({ program: document, frames: [0, 3, 4, 11] }, { resources, workers: 2,
    ...(testBrowser === undefined ? {} : { chromePath: testBrowser }),
    onProgress: event => { phases.push(event.phase); } });
  assert.equal(images.length, 4);
  assert.ok(!phases.includes("encoding"));
  for (const [index, expectedX] of [-1, 0, 8, 64].entries()) {
    const bytes = await resources.get(images[index]!.resource);
    const image = await sharp(bytes).removeAlpha().raw().toBuffer();
    const pixel = (x: number) => [...image.subarray(x * 3, x * 3 + 3)];
    assert.deepEqual(pixel(expectedX < 0 ? 0 : expectedX + 2), expectedX < 0 ? [0, 0, 0] : [255, 0, 0]);
    if (expectedX > 0) assert.deepEqual(pixel(0), [0, 0, 0]);
  }
  await assert.rejects(rasterizeHtmlFrames({ program: document, frames: [3] }, { resources, workers: 1, maxRenderedBytes: 1,
    ...(testBrowser === undefined ? {} : { chromePath: testBrowser }) }), /PNG output exceeds/u);
});
