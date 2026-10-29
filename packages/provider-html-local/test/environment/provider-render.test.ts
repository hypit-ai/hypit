import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { MemoryResourceStore } from "@hypit/executor";
import { verifyTimelineVisual } from "@hypit/media";
import type { CompositableSurfaceRef, TimelineVisual } from "@hypit/media";
import type { CanonicalValue } from "@hypit/protocol";
import { rasterizeHtmlProgram } from "../../src/index.js";
import { browserExecutablePath } from "../../src/browser.js";
import { localHtmlRendererProgram } from "../../src/program.js";
import { htmlProviderDelivery, htmlProviderDocument, htmlProviderHandler, htmlProviderNeed,
  htmlProviderHdr10Delivery, htmlProviderHdrDocument, htmlProviderNestedDocument } from "../provider-scenario.js";

test("an explicit browser renders without installing a managed replacement", async () => {
  const chromePath = process.env.HYPIT_TEST_CHROME_PATH ?? browserExecutablePath({});
  const program = localHtmlRendererProgram({ chromePath, id: "external", nodePath: process.execPath, ffprobePath: "ffprobe" });
  assert.equal(program.installation, undefined);
  assert.equal((await program.probe()).state, "ready");
  const diagnostics: string[] = [];
  const visual = await rasterizeHtmlProgram({ program: htmlProviderDocument(), delivery: htmlProviderDelivery() }, {
    chromePath, resources: new MemoryResourceStore(), workers: 1,
    onDiagnostic: async event => { diagnostics.push(event.message); },
  });
  assert.equal(visual.frameCount, 12);
  assert.ok(diagnostics.some(message => message.includes(`executable ${chromePath}`)));
});

test("the Chromium implementation refuses an HDR10 request instead of changing its delivery", async () => {
  await assert.rejects(rasterizeHtmlProgram({ program: htmlProviderHdrDocument(), delivery: htmlProviderHdr10Delivery() }, {
    resources: new MemoryResourceStore(),
    workers: 1,
  }), /requires the explicitly selected Electron renderer/u);
});

test("local HTML renderer Provider really renders a silent frame-exact MP4 with parallel workers", async () => {
  const resources = new MemoryResourceStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const surfaceArtifact = await resources.put(png, "image/png");
  const surface: CompositableSurfaceRef = {
    artifact: surfaceArtifact,
    width: 1,
    height: 1,
    picture: { colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 8, alphaMode: "straight" } as const,
    timing: { kind: "still" },
  };
  const request = htmlProviderNeed(htmlProviderDocument(surface));
  const { handler } = await htmlProviderHandler(request);
  const output = await handler({

    need: request, resources, credentials: {},
  });
  const value: CanonicalValue = output;
  verifyTimelineVisual(value);
  const visual = value as unknown as TimelineVisual;
  assert.equal(visual.frameCount, 12);
  assert.deepEqual(visual.canvas, { width: 160, height: 96 });
  assert.equal(await resources.has(visual.artifact.resource), true);
});

test("the selected HTML renderer evaluates a nested Composition without an intermediate video", async () => {
  const render = async (options: Omit<Parameters<typeof rasterizeHtmlProgram>[1], "resources">) => {
    const resources = new MemoryResourceStore();
    const visual = await rasterizeHtmlProgram({
      program: htmlProviderNestedDocument(),
      delivery: htmlProviderDelivery(),
    }, { ...options, resources });
    verifyTimelineVisual(visual);
    assert.equal(visual.frameCount, 12);
    assert.equal(await resources.has(visual.artifact.resource), true);
  };
  await render({ workers: 2 });
  if (process.env.HYPIT_TEST_ELECTRON_PATH !== undefined) await render({
    renderer: "electron",
    electronPath: process.env.HYPIT_TEST_ELECTRON_PATH,
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    workers: 1,
  });
});

test("Electron renders the final visual through browser decode, shared texture and WebCodecs", {
  skip: process.env.HYPIT_TEST_ELECTRON_PATH === undefined,
}, async () => {
  const resources = new MemoryResourceStore();
  const diagnostics: string[] = [];
  const visual = await rasterizeHtmlProgram({
    program: htmlProviderDocument(),
    delivery: htmlProviderDelivery(),
  }, {
    renderer: "electron",
    electronPath: process.env.HYPIT_TEST_ELECTRON_PATH!,
    ffmpegPath: "ffmpeg",
    ffprobePath: "ffprobe",
    workers: 1,
    resources,
    onDiagnostic: async event => { diagnostics.push(event.message); },
  });
  verifyTimelineVisual(visual);
  assert.equal(visual.frameCount, 12);
  assert.equal(await resources.has(visual.artifact.resource), true);
  assert.ok(diagnostics.some(message => message.includes("browser decode, WebCodecs H.264 and FFmpeg mux")));
});

test("Electron transforms the linear Programme to tagged 10-bit BT.2020 PQ through libx265", {
  skip: process.env.HYPIT_TEST_ELECTRON_PATH === undefined,
}, async () => {
  assert.deepEqual(await localHtmlRendererProgram({ id: "html.hdr10", renderer: "electron",
    electronPath: process.env.HYPIT_TEST_ELECTRON_PATH!, nodePath: process.execPath,
    ffmpegPath: "ffmpeg", ffprobePath: "ffprobe" }).probe(), { state: "ready" });
  const resources = new MemoryResourceStore();
  const delivery = htmlProviderHdr10Delivery("high");
  const visual = await rasterizeHtmlProgram({ program: htmlProviderHdrDocument(), delivery }, {
    renderer: "electron",
    electronPath: process.env.HYPIT_TEST_ELECTRON_PATH!,
    ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", workers: 1, resources,
  });
  verifyTimelineVisual(visual);
  assert.deepEqual(visual.delivery, delivery);
  const bytes = await resources.get(visual.artifact.resource);
  assert.ok(bytes !== undefined);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries",
    "stream=codec_name,profile,pix_fmt,color_range,color_space,color_transfer,color_primaries",
    "-of", "json", "pipe:0"], { input: bytes });
  assert.equal(probe.status, 0, probe.stderr.toString());
  const stream = (JSON.parse(probe.stdout.toString()) as { streams: Array<Record<string, unknown>> }).streams[0];
  assert.deepEqual(stream, { codec_name: "hevc", profile: "Main 10", pix_fmt: "yuv420p10le",
    color_range: "tv", color_space: "bt2020nc", color_transfer: "smpte2084", color_primaries: "bt2020" });
});
