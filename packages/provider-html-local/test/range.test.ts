import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ResourceIOOptions } from "@hypit/runtime";
import { sealComposition, sealVisualTrack } from "@hypit/composition";
import { mediaFrameRangeSamples } from "@hypit/media";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { compileHtmlProgram } from "@hypit/html-program";
import { sealTimeline } from "@hypit/timeline";
import type { BlobRef } from "@hypit/protocol";
import sharp from "sharp";
import { rasterizeHtmlProgram, rasterizeHtmlFrames } from "../src/index.js";
import { resolveExecutionOptions } from "../src/render.js";
import { hypitPackage } from "../src/activation.js";
import type { RuntimeEndpointAdapterImplementation } from "@hypit/runtime-local/extension";
import { endpointResourceClaims } from "@hypit/endpoint";
import { htmlProgramCapabilities } from "@hypit/html-program";
import { mediaTypes } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { HtmlRasterProgress } from "../src/index.js";
import { distributeFrameRange, requestedFrameRanges, sourceFrameAt, sourceWindows, videoSlots } from "../src/sampling.js";

function documentFor(artifact: BlobRef) {
  const space = sealTimeline({ id: "range-space", frameCount: 12, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealVisualTrack({ id: "video", visualIr: "hypit.visual-ir@1", timelineId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 12 },
      order: 0, z: 0, elements: [{ id: "video", order: 0, kind: "video", artifact,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
          { name: "width", value: "64px" }, { name: "height", value: "64px" }],
        sourceTime: { sourceFrameRate: space.frameRate, sourceFrameCount: 4, pieces: [
          { target: { startFrame: 0, endFrameExclusive: 6 }, sourceAtStart: { numerator: 2, denominator: 1 },
            rate: { numerator: 1, denominator: 1 }, wrap: { startFrame: 0, endFrameExclusive: 4 } },
          { target: { startFrame: 6, endFrameExclusive: 8 }, sourceAtStart: { numerator: 3, denominator: 1 },
            rate: { numerator: 0, denominator: 1 } },
          { target: { startFrame: 8, endFrameExclusive: 12 }, sourceAtStart: { numerator: 0, denominator: 1 },
            rate: { numerator: 1, denominator: 2 } },
        ] },
      }] }],
  });
  return compileHtmlProgram(sealComposition({ id: "range-video",
    canvas: { width: 64, height: 64, clearColor: "#000000" }, tracks: [track] }), space);
}

test("a render deadline cancels resource preparation and awaits the reader's cleanup", async () => {
  class StalledResources extends MemoryResourceStore {
    active = 0;
    override async get(_resource: string, options: ResourceIOOptions = {}) {
      this.active++;
      try { await delay(60_000, undefined, { signal: options.signal }); return new Uint8Array([0]); }
      finally { this.active--; }
    }
  }
  const resources = new StalledResources();
  const document = documentFor({ kind: "blob", resource: "res_waiting", size: 1, mediaType: "video/mp4" });
  // This test stops during resource preparation, before any browser is launched.
  await assert.rejects(rasterizeHtmlProgram({ program: document }, { resources, chromePath: process.execPath, processTimeoutMs: 100 }),
    /render timed out during preparing resources/u);
  assert.equal(resources.active, 0, "the failed render must not leave its reader running");
});

test("the render deadline is global while stage deadlines are explicit deployment policy", () => {
  const defaults = resolveExecutionOptions({});
  assert.equal(defaults.processTimeoutMs, 30 * 60_000);
  assert.equal(defaults.initializationTimeoutMs, undefined);
  assert.equal(defaults.frameTimeoutMs, undefined);
  assert.equal(defaults.artifactStagingConcurrency, 4);
  assert.equal(defaults.maxPendingFrameBytes, 128 * 1024 * 1024);
  assert.equal(defaults.maxDecodedSourceBytes, 2304 * 1024 * 1024);

  const explicit = resolveExecutionOptions({ initializationTimeoutMs: 31_000, frameTimeoutMs: 16_000,
    artifactStagingConcurrency: 3, maxPendingFrameBytes: 12_345, maxDecodedSourceBytes: 54_321 });
  assert.equal(explicit.initializationTimeoutMs, 31_000);
  assert.equal(explicit.frameTimeoutMs, 16_000);
  assert.equal(explicit.artifactStagingConcurrency, 3);
  assert.equal(explicit.maxPendingFrameBytes, 12_345);
  assert.equal(explicit.maxDecodedSourceBytes, 54_321);
});

test("source selection retains loop, hold and fractional-speed sampling and shares decoded frames", () => {
  const document = documentFor({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
  const slots = videoSlots(document.frameSources, resource => `hypit-resource://${resource}`);
  assert.ok(slots.every(slot => slot.src === "hypit-resource://res_range_source"));
  assert.equal(slots.length, 4, "the two-frame hold remains one slot instead of one slot per target frame");
  const hold = slots.find((slot) => slot.sourceRate.numerator === 0n);
  assert.ok(hold !== undefined);
  assert.deepEqual({ startFrame: hold.startFrame, endFrameExclusive: hold.endFrameExclusive,
    sourceAtStart: hold.sourceFrame, sourceRate: hold.sourceRate }, {
    startFrame: 6, endFrameExclusive: 8,
    sourceAtStart: { numerator: 3n, denominator: 1n }, sourceRate: { numerator: 0n, denominator: 1n },
  });
  const range = { startFrame: 3, endFrameExclusive: 11 };
  const sampled = Array.from({ length: 8 }, (_, i) => {
    const frame = range.startFrame + i;
    return sourceFrameAt(slots.find((s) => frame >= s.startFrame && frame < s.endFrameExclusive)!, frame);
  });
  assert.deepEqual(sampled, [1, 2, 3, 3, 3, 0, 0, 1]);
  assert.deepEqual(sourceWindows(slots, range)[0]?.windows, [{ startFrame: 0, endFrameExclusive: 4 }]);
  assert.deepEqual(distributeFrameRange(range, 3), [
    { startFrame: 3, endFrameExclusive: 5 }, { startFrame: 5, endFrameExclusive: 8 },
    { startFrame: 8, endFrameExclusive: 11 },
  ]);
});

test("reverse source time selects the same bounded decoded window without forward traversal", () => {
  const [slot] = videoSlots([{ id: "reverse", resource: "res_reverse", startFrame: 0, endFrameExclusive: 4,
    sourceFrame: { numerator: 3, denominator: 1 }, sourceRate: { numerator: -1, denominator: 1 },
    sourceFrameRate: { numerator: 30, denominator: 1 } }], () => "direct.mp4");
  assert.ok(slot !== undefined);
  assert.deepEqual(Array.from({ length: 4 }, (_, frame) => sourceFrameAt(slot, frame)), [3, 2, 1, 0]);
  assert.deepEqual(sourceWindows([slot], { startFrame: 0, endFrameExclusive: 4 }), [{
    src: "direct.mp4", fps: { num: 30, den: 1 }, windows: [{ startFrame: 0, endFrameExclusive: 4 }],
  }]);
});

test("page selection compacts arbitrary requested frames without inventing coverage across gaps", () => {
  assert.deepEqual(requestedFrameRanges({ startFrame: 3, endFrameExclusive: 12 }), [
    { startFrame: 3, endFrameExclusive: 12 },
  ]);
  assert.deepEqual(requestedFrameRanges({ startFrame: 3, endFrameExclusive: 12 }, [3, 4, 7, 8, 9, 11]), [
    { startFrame: 3, endFrameExclusive: 5 },
    { startFrame: 7, endFrameExclusive: 10 },
    { startFrame: 11, endFrameExclusive: 12 },
  ]);
});

test("real selected renders sample video correctly across wrap, hold and fractional rates with independent browsers", {
  skip: process.env.HYPIT_BROWSER_TESTS !== "1",
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-range-test-"));
  const browser = process.env.HYPIT_TEST_CHROME_PATH === undefined
    ? {} : { chromePath: process.env.HYPIT_TEST_CHROME_PATH };
  try {
    const colors = [[240, 20, 20], [20, 220, 20], [20, 20, 240], [220, 220, 20]];
    const raw = Buffer.concat(colors.map((color) => Buffer.from(Array.from({ length: 64 * 64 }, () => color).flat())));
    const path = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", path], { input: raw });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const resources = new MemoryResourceStore();
    const document = documentFor(await resources.put(await readFile(path), "video/mp4"));
    const events: HtmlRasterProgress[] = [];
    const render = async (name: string, range: { startFrame: number; endFrameExclusive: number } | undefined,
      workers: number) => {
      const warnings: string[] = [];
      const visual = await rasterizeHtmlProgram({ program: document, ...(range === undefined ? {} : { range }) },
        { resources, workers, quality: "high", processTimeoutMs: 120000, ...browser,
          maxPendingFrameBytes: 1, maxDecodedSourceBytes: 1,
          onProgress: (e) => events.push(e),
          onDiagnostic: async (event) => { if (event.level === "warning") warnings.push(event.message); } });
      assert.deepEqual(warnings, [], "a completed render should close its resources and exit without forced cleanup");
      const file = join(root, `${name}.mp4`);
      await writeFile(file, (await resources.get(visual.artifact.resource))!);
      const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
      assert.equal(decoded.status, 0, decoded.stderr.toString());
      return decoded.stdout;
    };
    const full = await render("full", undefined, 1);
    events.length = 0;
    const selected = await render("selected", { startFrame: 3, endFrameExclusive: 11 }, 3);
    const starts = events.filter((e): e is Extract<HtmlRasterProgress, { browserPid: number | undefined }> => e.phase === "worker-start");
    assert.equal(starts.length, 3);
    assert.equal(new Set(starts.map((e) => e.browserPid)).size, 3);
    const one = await render("one", { startFrame: 7, endFrameExclusive: 8 }, 4);
    const stride = 64 * 64 * 3, center = (32 * 64 + 32) * 3;
    assert.equal(full.length, 12 * stride);
    assert.equal(selected.length, 8 * stride);
    assert.equal(one.length, stride);
    for (const [i, source] of [1, 2, 3, 3, 3, 0, 0, 1].entries()) {
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(selected[i * stride + center + channel]! - colors[source]![channel]!) < 12);
        assert.ok(Math.abs(selected[i * stride + center + channel]! - full[(i + 3) * stride + center + channel]!) < 4);
      }
    }
    for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(one[center + channel]! - colors[3]![channel]!) < 12);
    const snapshots = await rasterizeHtmlFrames({ program: document, frames: [3, 7, 8, 11] },
      { resources, workers: 2, ...browser });
    for (const [index, source] of [1, 3, 0, 1].entries()) {
      const pixels = await sharp((await resources.get(snapshots[index]!.resource))!).removeAlpha().raw().toBuffer();
      for (let channel = 0; channel < 3; channel++) assert.ok(Math.abs(pixels[center + channel]! - colors[source]![channel]!) < 12);
    }
    await assert.rejects(rasterizeHtmlProgram({ program: document, range: { startFrame: 7, endFrameExclusive: 8 } },
      { resources, workers: 2, initializationTimeoutMs: 1, processTimeoutMs: 30_000, ...browser }),
      /worker 0 initialization timed out/);
    assert.equal((await render("after-timeout", { startFrame: 7, endFrameExclusive: 8 }, 1)).length, stride);

    // One cancelled attempt must not interrupt a different render using the same source store.
    const controller = new AbortController();
    const stopped = rasterizeHtmlProgram({ program: document }, { resources, workers: 4, signal: controller.signal, ...browser,
      onProgress: (event) => { if (event.phase === "worker-start") controller.abort(new Error("stop this attempt")); } });
    const [failed, completed] = await Promise.allSettled([stopped, render("concurrent", undefined, 2)]);
    assert.equal(failed.status, "rejected");
    assert.equal(completed.status, "fulfilled");
    if (completed.status === "fulfilled") assert.equal(completed.value.length, 12 * stride);

    class StalledOutput extends MemoryResourceStore {
      active = false;
      override get(resource: BlobRef["resource"], options?: ResourceIOOptions) { return resources.get(resource, options); }
      override async put(_bytes: Uint8Array, _mediaType: string, options: ResourceIOOptions = {}): Promise<BlobRef> {
        this.active = true;
        storeController.abort(new Error("stop output storage"));
        try { await delay(60_000, undefined, { signal: options.signal }); throw new Error("unexpected completion"); }
        finally { this.active = false; }
      }
    }
    const storeController = new AbortController();
    const outputResources = new StalledOutput();
    await assert.rejects(rasterizeHtmlProgram({ program: document, range: { startFrame: 0, endFrameExclusive: 1 } },
      { resources: outputResources, workers: 1, signal: storeController.signal, ...browser }), /stop output storage/u);
    assert.equal(outputResources.active, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("fractional frame rates keep selected audio duration on the output frame clock", () => {
  assert.deepEqual(mediaFrameRangeSamples({ startFrame: 1, endFrameExclusive: 2 },
    { numerator: 30000, denominator: 1001 }), { startSample: 1602, endSampleExclusive: 3204, sampleFrames: 1602 });
});


test("HTML claims actual browser count including a range shorter than workers", async () => {
  const document = documentFor({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
  const request = { id: "visual", capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual, constraints: canonicalize({ program: document }), result: "visual-result" };
  const adapter = hypitPackage.facets[0]!.implementation as RuntimeEndpointAdapterImplementation;
  for (const [workers, browserCapacity, expectedUnits] of [[4, 6, 4], [128, 128, 12]] as const) {
    const registry = new EndpointRegistry();
    const activation = await adapter.activate({
      hostStateRoot: tmpdir(), dataRoot: tmpdir(), instance: "render", pool: "machine",
      config: canonicalize({ workers, defaultConcurrency: 2, browserCapacity }),
    });
    await activation.endpoint.install(registry);
    const selected = registry.resolve(request);
    assert.equal(selected.status, "resolved");
    const claims = endpointResourceClaims(selected.registration.scheduling!, request);
    assert.deepEqual(claims.at(-1), { id: "capacity:machine/browsers", limit: browserCapacity, units: expectedUnits });
    const single = { ...request, constraints: canonicalize({ program: document, range: { startFrame: 7, endFrameExclusive: 8 } }) };
    assert.deepEqual(endpointResourceClaims(selected.registration.scheduling!, single).at(-1),
      { id: "capacity:machine/browsers", limit: browserCapacity, units: 1 });
  }
});
