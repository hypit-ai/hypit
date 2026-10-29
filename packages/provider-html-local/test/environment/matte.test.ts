import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sealComposition, sealPresentVisualTrack, sealVisualScope } from "@hypit/composition";
import { MemoryResourceStore } from "@hypit/executor";
import { compileHtmlProgram, htmlVisualElement } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";
import { exactTemporalValueFromFrames, resolveTemporalRelation, sealLocalTemporalDomain } from "@hypit/temporal";
import { visualMatteEffect } from "@hypit/visual-matte";
import sharp from "sharp";

import { ffmpegBytes, writeTestArtifact } from "../../../../test/alpha-video-fixture.js";
import { rasterizeHtmlFrames, rasterizeHtmlProgram } from "../../src/index.js";
import { htmlProviderDelivery, htmlProviderPicture } from "../provider-scenario.js";

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
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" },
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

test("Chromium resolves a child Picture Process before its parent Picture Process", async () => {
  const childTimeline = sealTimeline({ id: "child-matte", frameCount: 1,
    frameRate: { numerator: 1, denominator: 1 } });
  const childContent = sealPresentVisualTrack({
    id: "child-content", timelineId: childTimeline.id,
    presents: [{ id: "child-content", span: { startFrame: 0, endFrameExclusive: 1 },
      root: htmlVisualElement(fillBox("red", "#ff0000", "32px", "32px")) }],
  });
  const childMatte = sealPresentVisualTrack({
    id: "child-matte", timelineId: childTimeline.id,
    presents: [{
      id: "child-matte", span: { startFrame: 0, endFrameExclusive: 1 },
      root: htmlVisualElement({ ...fillBox("black", "#000000", "32px", "32px"),
        children: [fillBox("white-half", "#ffffff", "16px", "32px")] }),
    }],
  });
  const childRoot = sealVisualScope({ members: [{
    kind: "process",
    id: "child-cutout",
    inputs: [
      { name: "content", scope: { members: [{ kind: "track", id: "content", track: childContent }] } },
      { name: "matte", scope: { members: [{ kind: "track", id: "matte", track: childMatte }] } },
    ],
    effect: visualMatteEffect("luminance", false),
  }] });
  const child = sealComposition({
    id: "child-matte",
    visual: {
      picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" },
      canvas: { width: 32, height: 32, clearColor: "#00000000" },
      root: childRoot,
    },
    audio: { contributions: [] },
  }, childTimeline);

  const timeline = sealTimeline({ id: "parent-matte", frameCount: 1,
    frameRate: { numerator: 1, denominator: 1 } });
  const sampling = resolveTemporalRelation({
    target: sealLocalTemporalDomain({ id: "child-occurrence",
      duration: exactTemporalValueFromFrames(1, timeline) }),
    source: sealLocalTemporalDomain({ id: "child-program",
      duration: exactTemporalValueFromFrames(1, childTimeline) }),
    clock: timeline,
  });
  const nested = sealPresentVisualTrack({ id: "nested", timelineId: timeline.id,
    presents: [{ id: "nested", span: { startFrame: 0, endFrameExclusive: 1 },
      root: { id: "nested-child", kind: "composition", composition: child, sampling } }],
  });
  const parentMatte = sealPresentVisualTrack({ id: "parent-matte", timelineId: timeline.id,
    presents: [{ id: "parent-matte", span: { startFrame: 0, endFrameExclusive: 1 },
      root: fill("parent-white", "#ffffff") }],
  });
  const root = sealVisualScope({ members: [{
    kind: "process", id: "parent-cutout",
    inputs: [
      { name: "content", scope: { members: [{ kind: "track", id: "nested", track: nested }] } },
      { name: "matte", scope: { members: [{ kind: "track", id: "matte", track: parentMatte }] } },
    ],
    effect: visualMatteEffect("luminance", false),
  }] });
  const document = compileHtmlProgram(sealComposition({ id: "parent-matte", visual: {
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" },
    canvas: { width: 64, height: 64, clearColor: "#0000ff" }, root,
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
  close(pixel(8, 16), [255, 0, 0]);
  close(pixel(24, 16), [0, 0, 0]);
  if (process.env.HYPIT_TEST_ELECTRON_PATH !== undefined) {
    const directory = await mkdtemp(join(tmpdir(), "hypit-sibling-matte-"));
    try {
      const video = await rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery() }, {
        renderer: "electron",
        electronPath: process.env.HYPIT_TEST_ELECTRON_PATH,
        ffmpegPath: "ffmpeg",
        ffprobePath: "ffprobe",
        resources,
        workers: 1,
      });
      const path = await writeTestArtifact(resources, video.artifact, join(directory, "matte.mp4"));
      const electronPixels = ffmpegBytes(["-i", path, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]);
      const electronPixel = (x: number, y: number) => [...electronPixels.subarray((y * 64 + x) * 3, (y * 64 + x) * 3 + 3)];
      close(electronPixel(16, 32), [255, 0, 0]);
      close(electronPixel(48, 32), [0, 0, 0]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
