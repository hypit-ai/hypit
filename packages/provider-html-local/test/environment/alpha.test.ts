import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sealComposition } from "@hypit/composition";
import { compileHtmlProgram } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";
import { appendVisualClip, appendTimedMediaLayer, createMediaLayerSet, createVisualTrackSet,
  finalizeVisualTrack, projectVisualTrack, sealVisualClipSpec, sealMediaSampleLayerSpec,
  sealVisualTrackHeader } from "@hypit/visual-track";
import { projectProgramWindow } from "../../../../test/temporal-fixture.js";
import { MemoryResourceStore, ffmpegBytes, prepareTestVideo, transparentVideoFixture, writeTestArtifact } from "../../../../test/alpha-video-fixture.js";
import sharp from "sharp";
import { rasterizeHtmlProgram, rasterizeHtmlFrames } from "../../src/index.js";
import { htmlProviderDelivery, htmlProviderPicture } from "../provider-scenario.js";

test("transparent Prepared Media composites through an explicit Visual Clip in Chrome and Electron", async () => {
  const directory = process.env.HYPIT_ALPHA_PROOF_DIR ?? await mkdtemp(join(tmpdir(), "hypit-alpha-render-"));
  await mkdir(directory, { recursive: true });
  try {
    const resources = new MemoryResourceStore();
    const chromeOptions = process.env.HYPIT_TEST_CHROME_PATH === undefined
      ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH };
    const fixture = await transparentVideoFixture(directory, "webm");
    const source = await resources.put(fixture.bytes, fixture.mediaType);
    const media = await prepareTestVideo(resources, source, true, "speech");
    const broll = await prepareTestVideo(resources, source, false, "broll");
    const fit = { sizing: "contain" as const, framePoint: { x: 0.5, y: 0.5 }, contentPoint: { x: 0.5, y: 0.5 },
      offsetPx: { x: 0, y: 0 }, constraint: "bounded" as const };
    const frame = { xPx: 0, yPx: 0, widthPx: 96, heightPx: 64 };
    const space = sealTimeline({ id: "film", frameRate: { numerator: 12, denominator: 1 }, frameCount: 12 });
    const header = sealVisualTrackHeader({ id: "broll" });
    const layers = appendTimedMediaLayer(createMediaLayerSet(), broll, fit, sealMediaSampleLayerSpec({ id: "cutout",
      appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
    }));
    const spec = sealVisualClipSpec({ id: "broll-cutout",
      treatment: { clip: { kind: "none" }, padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
        border: { widthPx: 0, style: "solid", color: "#000000" }, shadows: [] } });
    const items = appendVisualClip(createVisualTrackSet(), header, space,
      layers, { ...frame, xPx: 96 }, spec, projectProgramWindow({
        itemId: spec.id, semantic: space, projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } },
      }));
    const speechHeader = sealVisualTrackHeader({ id: "speech" });
    const speechSpec = { ...spec, id: "speech" };
    const speechLayers = appendTimedMediaLayer(createMediaLayerSet(), media, fit, sealMediaSampleLayerSpec({
      id: "content",
      appearance: { opacity: 1, filter: { blurPx: 0, brightness: 1, contrast: 1, saturation: 1 } },
    }));
    const speechSet = appendVisualClip(createVisualTrackSet(), speechHeader, space,
      speechLayers, frame, speechSpec,
      projectProgramWindow({ itemId: speechSpec.id, semantic: space,
        projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } } }));
    const speechVisual = projectVisualTrack(space, finalizeVisualTrack(speechSet, speechHeader, space));
    const brollVisual = projectVisualTrack(space, finalizeVisualTrack(items, header, space));
    const document = compileHtmlProgram(sealComposition({ id: "alpha-proof", visual: { picture: { colorPrimaries: "bt709", colorTransfer: "srgb", referenceWhiteNits: 100, alphaMode: "premultiplied" } as const, canvas: { width: 192, height: 64, clearColor: "#143cdc" }, root: { members: [speechVisual, brollVisual].map(track => ({ kind: "track" as const, id: track.id, track })) } }, audio: { contributions: [] } }, space));
    const rendered = await rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high") },
      { resources, ...chromeOptions, workers: 2, processTimeoutMs: 120_000 });
    const video = await writeTestArtifact(resources, rendered.artifact, join(directory, "speech-and-broll.mp4"));
    const pixels = ffmpegBytes(["-i", video, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]);
    assert.equal(pixels.length, 192 * 64 * 3 * 12);
    const pixel = (f: number, x: number, y: number) => [...pixels.subarray(((f * 64 + y) * 192 + x) * 3, ((f * 64 + y) * 192 + x) * 3 + 3)];
    const close = (actual: number[], expected: number[]) => {
      assert.ok(actual.every((value, i) => Math.abs(value - expected[i]!) < 14), `${actual} differs from ${expected}`);
    };
    for (let f = 0; f < 12; f++) for (const left of [0, 96]) {
      close(pixel(f, left + 4, 4), [20, 60, 220]);
      close(pixel(f, left + 32, 32), [240, 20, 20]);
      close(pixel(f, left + 60, 32), [130, 40, 120]);
    }
    const snapshots = await rasterizeHtmlFrames({ program: document, picture: htmlProviderPicture(),
      frames: [0, 11] }, { resources, ...chromeOptions, workers: 2 });
    for (const snapshot of snapshots.frames) {
      const pixels = await sharp((await resources.get(snapshot.artifact.resource))!).removeAlpha().raw().toBuffer();
      const at = (x: number, y: number) => [...pixels.subarray((y * 192 + x) * 3, (y * 192 + x) * 3 + 3)];
      for (const left of [0, 96]) {
        close(at(left + 4, 4), [20, 60, 220]);
        close(at(left + 32, 32), [240, 20, 20]);
        close(at(left + 60, 32), [130, 40, 120]);
      }
    }
    close(pixel(0, 18, 32), [240, 20, 20]);
    close(pixel(11, 18, 32), [20, 60, 220]);
    if (process.env.HYPIT_TEST_ELECTRON_PATH !== undefined) {
      const electronRendered = await rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery("high") }, {
        renderer: "electron", electronPath: process.env.HYPIT_TEST_ELECTRON_PATH,
        resources, workers: 1, processTimeoutMs: 120_000,
      });
      const electronVideo = await writeTestArtifact(resources, electronRendered.artifact,
        join(directory, "speech-and-broll-electron.mp4"));
      const electronPixels = ffmpegBytes(["-i", electronVideo, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]);
      assert.equal(electronPixels.length, pixels.length);
      const electronPixel = (f: number, x: number, y: number) => [...electronPixels.subarray(
        ((f * 64 + y) * 192 + x) * 3, ((f * 64 + y) * 192 + x) * 3 + 3)];
      for (let f = 0; f < 12; f++) for (const left of [0, 96]) {
        close(electronPixel(f, left + 4, 4), [20, 60, 220]);
        close(electronPixel(f, left + 32, 32), [240, 20, 20]);
        close(electronPixel(f, left + 60, 32), [130, 40, 120]);
      }
      close(electronPixel(0, 18, 32), [240, 20, 20]);
      close(electronPixel(11, 18, 32), [20, 60, 220]);
    }
  } finally {
    if (process.env.HYPIT_ALPHA_PROOF_DIR === undefined) await rm(directory, { recursive: true, force: true });
  }
});
