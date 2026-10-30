import assert from "node:assert/strict";
import test from "node:test";
import { sealComposition, sealPresentVisualTrack, sealVisualScope } from "@hypit/composition";
import { MemoryResourceStore } from "@hypit/executor";
import { compileHtmlProgram, htmlVisualElement } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";
import { visualMatteEffect } from "@hypit/visual-matte";
import sharp from "sharp";

import { rasterizeHtmlFrames } from "../../src/index.js";
import { htmlProviderPicture } from "../provider-scenario.js";

const fillBox = (id: string, color: string, width = "64px", height = "64px") => ({
  id,
  kind: "box" as const,
  children: [],
  style: [
    { name: "position" as const, value: "absolute" },
    { name: "left" as const, value: "0px" },
    { name: "top" as const, value: "0px" },
    { name: "width" as const, value: width },
    { name: "height" as const, value: height },
    { name: "background" as const, value: color },
  ],
});
const fill = (id: string, color: string, width = "64px") =>
  htmlVisualElement(fillBox(id, color, width));

test("scope Process capture excludes an earlier sibling Picture", async () => {
  const timeline = sealTimeline({ id: "sibling-process", frameCount: 1,
    frameRate: { numerator: 1, denominator: 1 } });
  const sibling = sealPresentVisualTrack({ id: "sibling", timelineId: timeline.id,
    presents: [{ id: "sibling", span: { startFrame: 0, endFrameExclusive: 1 },
      root: fill("blue", "#0000ff") }],
  });
  const content = sealPresentVisualTrack({ id: "content", timelineId: timeline.id,
    presents: [{ id: "content", span: { startFrame: 0, endFrameExclusive: 1 },
      root: fill("red", "#ff0000") }],
  });
  const matte = sealPresentVisualTrack({ id: "matte", timelineId: timeline.id,
    presents: [{ id: "matte", span: { startFrame: 0, endFrameExclusive: 1 },
      root: htmlVisualElement({ ...fillBox("black", "#000000"),
        children: [fillBox("white-half", "#ffffff", "32px")] }) }],
  });
  const root = sealVisualScope({ members: [
    { kind: "track", id: "sibling", track: sibling },
    {
      kind: "process", id: "cutout",
      inputs: [
        { name: "content", scope: { members: [{ kind: "track", id: "content", track: content }] } },
        { name: "matte", scope: { members: [{ kind: "track", id: "matte", track: matte }] } },
      ],
      effect: visualMatteEffect("luminance", false),
    },
  ] });
  const document = compileHtmlProgram(sealComposition({ id: "sibling-process", visual: {
    canvas: { width: 64, height: 64, clearColor: "#00000000" }, root,
  }, audio: { contributions: [] } }, timeline));
  const resources = new MemoryResourceStore();
  const rendered = await rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(), frames: [0] }, {
    resources,
    workers: 1,
  });
  const bytes = await resources.get(rendered.frames[0]!.artifact.resource);
  assert.ok(bytes !== undefined);
  const pixels = await sharp(bytes).removeAlpha().raw().toBuffer();
  const pixel = (x: number, y: number) => [...pixels.subarray((y * 64 + x) * 3, (y * 64 + x) * 3 + 3)];
  const close = (actual: number[], expected: number[]) => assert.ok(
    actual.every((value, index) => Math.abs(value - expected[index]!) < 8),
    `${actual} differs from ${expected}`,
  );
  close(pixel(16, 32), [255, 0, 0]);
  close(pixel(48, 32), [0, 0, 255]);
});

test("nested scope Processes settle child Pictures before their parent", async () => {
  const timeline = sealTimeline({ id: "nested-process", frameCount: 1,
    frameRate: { numerator: 1, denominator: 1 } });
  const track = (id: string, root: ReturnType<typeof htmlVisualElement>) => sealPresentVisualTrack({
    id, timelineId: timeline.id,
    presents: [{ id, span: { startFrame: 0, endFrameExclusive: 1 }, root }],
  });
  const inner = sealVisualScope({ members: [{
    kind: "process", id: "inner",
    inputs: [
      { name: "content", scope: { members: [{ kind: "track", id: "red",
        track: track("red", fill("red", "#ff0000")) }] } },
      { name: "matte", scope: { members: [{ kind: "track", id: "half",
        track: track("half", htmlVisualElement({ ...fillBox("black", "#000000"),
          children: [fillBox("white-half", "#ffffff", "32px")] })) }] } },
    ],
    effect: visualMatteEffect("luminance", false),
  }] });
  const root = sealVisualScope({ members: [{
    kind: "process", id: "outer",
    inputs: [
      { name: "content", scope: inner },
      { name: "matte", scope: { members: [{ kind: "track", id: "white",
        track: track("white", fill("white", "#ffffff")) }] } },
    ],
    effect: visualMatteEffect("luminance", false),
  }] });
  const document = compileHtmlProgram(sealComposition({ id: "nested-process", visual: {
    canvas: { width: 64, height: 64, clearColor: "#000000" }, root,
  }, audio: { contributions: [] } }, timeline));
  assert.deepEqual(document.processUsages.map((usage) => usage.order), [1, 2]);
  const resources = new MemoryResourceStore();
  const rendered = await rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(), frames: [0] }, {
    resources,
    workers: 1,
  });
  const bytes = await resources.get(rendered.frames[0]!.artifact.resource);
  assert.ok(bytes !== undefined);
  const pixels = await sharp(bytes).removeAlpha().raw().toBuffer();
  const pixel = (x: number, y: number) => [...pixels.subarray((y * 64 + x) * 3, (y * 64 + x) * 3 + 3)];
  assert.ok(pixel(16, 32)[0]! > 240 && pixel(16, 32)[1]! < 10 && pixel(16, 32)[2]! < 10);
  assert.ok(pixel(48, 32).every((value) => value < 10));
});
