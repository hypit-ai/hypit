import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sealComposition, sealVisualTrack } from "@hypit/composition";
import { mediaFrameRangeSamples } from "@hypit/media";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/driver-node";
import { compileHyperframesDocument } from "@hypit/hyperframes";
import { sealProgramSpace } from "@hypit/program-space";
import type { BlobRef } from "@hypit/protocol";
import { renderHyperframesVisual } from "../src/index.js";
import { hypitPackage } from "../src/activation.js";
import type { RuntimeEndpointAdapterImplementation } from "@hypit/runtime-kit";
import { endpointResourceClaims } from "@hypit/endpoint-kit";
import { renderHyperframesCapabilities } from "@hypit/render-hyperframes";
import { mediaTypes } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import type { HyperframesRenderProgress } from "../src/index.js";
import { distributeFrameRange, sourceFrameAt, sourceWindows, videoSlots } from "../src/sampling.js";

function documentFor(artifact: BlobRef) {
  const space = sealProgramSpace({ id: "range-space", narrativeId: "range-narrative",
    durationSec: 12 / 30, frameRate: { numerator: 30, denominator: 1 } });
  const track = sealVisualTrack({ id: "video", visualIr: "hypit.visual-ir@1", programSpaceId: space.id,
    presents: [{ id: "sample", span: { startFrame: 0, endFrameExclusive: 12 },
      stacking: { order: 0, tieBreak: "sample" }, elements: [{ id: "video", order: 0, kind: "video", artifact,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
          { name: "width", value: "64px" }, { name: "height", value: "64px" }],
        sampling: { sourceFrameRate: space.frameRate, sourceFrameCount: 4, segments: [
          { target: { startFrame: 0, endFrameExclusive: 6 }, sourceFrame: { numerator: 2, denominator: 1 },
            rate: { numerator: 1, denominator: 1 }, loop: { startFrame: 0, endFrameExclusive: 4 } },
          { target: { startFrame: 6, endFrameExclusive: 8 }, sourceFrame: { numerator: 3, denominator: 1 },
            rate: { numerator: 0, denominator: 1 } },
          { target: { startFrame: 8, endFrameExclusive: 12 }, sourceFrame: { numerator: 0, denominator: 1 },
            rate: { numerator: 1, denominator: 2 } },
        ] },
      }] }],
  });
  return compileHyperframesDocument(sealComposition({ id: "range-video",
    canvas: { width: 64, height: 64, clearColor: "#000000" }, tracks: [track] }), space);
}

test("source selection retains loop, hold and fractional-speed sampling and shares decoded frames", () => {
  const document = documentFor({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
  const slots = videoSlots(document.html);
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

test("real selected renders sample video correctly across loop, hold and stretch with independent browsers", {
  skip: process.env.HYPIT_BROWSER_TESTS !== "1",
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-render-range-test-"));
  try {
    const colors = [[240, 20, 20], [20, 220, 20], [20, 20, 240], [220, 220, 20]];
    const raw = Buffer.concat(colors.map((color) => Buffer.from(Array.from({ length: 64 * 64 }, () => color).flat())));
    const path = join(root, "source.mp4");
    const encoded = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
      "-s", "64x64", "-r", "30", "-i", "pipe:0", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", path], { input: raw });
    assert.equal(encoded.status, 0, encoded.stderr.toString());
    const resources = new MemoryResourceStore();
    const document = documentFor(await resources.put(await readFile(path), "video/mp4"));
    const events: HyperframesRenderProgress[] = [];
    const render = async (name: string, range: { startFrame: number; endFrameExclusive: number } | undefined,
      workers: number) => {
      const visual = await renderHyperframesVisual({ document, ...(range === undefined ? {} : { range }) },
        { resources, workers, quality: "high", processTimeoutMs: 120000, onProgress: (e) => events.push(e) });
      const file = join(root, `${name}.mp4`);
      await writeFile(file, (await resources.get(visual.artifact.resource))!);
      const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
      assert.equal(decoded.status, 0, decoded.stderr.toString());
      return decoded.stdout;
    };
    const full = await render("full", undefined, 1);
    events.length = 0;
    const selected = await render("selected", { startFrame: 3, endFrameExclusive: 11 }, 3);
    const starts = events.filter((e): e is Extract<HyperframesRenderProgress, { worker: number }> => e.phase === "worker-start");
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
    await assert.rejects(renderHyperframesVisual({ document, range: { startFrame: 7, endFrameExclusive: 8 } },
      { resources, workers: 2, initializationTimeoutMs: 1, processTimeoutMs: 30_000 }), /worker 0 initialization timed out/);
    assert.equal((await render("after-timeout", { startFrame: 7, endFrameExclusive: 8 }, 1)).length, stride);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("fractional frame rates keep selected audio duration on the output frame clock", () => {
  assert.deepEqual(mediaFrameRangeSamples({ startFrame: 1, endFrameExclusive: 2 },
    { numerator: 30000, denominator: 1001 }), { startSample: 1602, endSampleExclusive: 3204, sampleFrames: 1602 });
});


test("Hyperframes claims actual browser count including a range shorter than workers", async () => {
  const document = documentFor({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
  const request = { id: "visual", capability: renderHyperframesCapabilities.renderVisual,
    returns: mediaTypes.renderedVisual, constraints: canonicalize({ document }), result: "visual-result" };
  const adapter = hypitPackage.hostFacets[0]!.implementation as RuntimeEndpointAdapterImplementation;
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
    const single = { ...request, constraints: canonicalize({ document, range: { startFrame: 7, endFrameExclusive: 8 } }) };
    assert.deepEqual(endpointResourceClaims(selected.registration.scheduling!, single).at(-1),
      { id: "capacity:machine/browsers", limit: browserCapacity, units: 1 });
  }
});
