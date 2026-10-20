import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ResourceIOOptions } from "@hypit/runtime";
import { mediaFrameRangeSamples } from "@hypit/media";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { rasterizeHtmlProgram } from "../src/index.js";
import { resolveExecutionOptions } from "../src/render.js";
import { hypitPackage } from "../src/activation.js";
import type { RuntimeEndpointAdapterImplementation } from "@hypit/runtime-local/extension";
import { endpointResourceClaims, installEndpoint } from "@hypit/endpoint";
import { htmlProgramCapabilities } from "@hypit/html-program";
import { mediaTypes } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import { distributeFrameRange, requestedFrameRanges, sourceFrameAt, sourceWindows, videoSlots } from "../src/sampling.js";
import { htmlRangeDocument } from "./range-scenario.js";

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
  const document = htmlRangeDocument({ kind: "blob", resource: "res_waiting", size: 1, mediaType: "video/mp4" });
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
  assert.equal(defaults.maxPendingFrameBytes, 256 * 1024 * 1024);
  assert.equal(defaults.maxDecodedSourceBytes, 1024 * 1024 * 1024);

  const explicit = resolveExecutionOptions({ initializationTimeoutMs: 31_000, frameTimeoutMs: 16_000,
    artifactStagingConcurrency: 3, maxPendingFrameBytes: 12_345, maxDecodedSourceBytes: 54_321 });
  assert.equal(explicit.initializationTimeoutMs, 31_000);
  assert.equal(explicit.frameTimeoutMs, 16_000);
  assert.equal(explicit.artifactStagingConcurrency, 3);
  assert.equal(explicit.maxPendingFrameBytes, 12_345);
  assert.equal(explicit.maxDecodedSourceBytes, 54_321);
});

test("source selection retains loop, hold and fractional-speed sampling and shares decoded frames", () => {
  const document = htmlRangeDocument({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
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

test("fractional frame rates keep selected audio duration on the output frame clock", () => {
  assert.deepEqual(mediaFrameRangeSamples({ startFrame: 1, endFrameExclusive: 2 },
    { numerator: 30000, denominator: 1001 }), { startSample: 1602, endSampleExclusive: 3204, sampleFrames: 1602 });
});


test("HTML claims actual browser count including a range shorter than workers", async () => {
  const document = htmlRangeDocument({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
  const request = { id: "visual", capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual, constraints: canonicalize({ program: document }), result: "visual-result" };
  const adapter = hypitPackage.facets[0]!.implementation as RuntimeEndpointAdapterImplementation;
  for (const [workers, browserCapacity, expectedUnits] of [[4, 6, 4], [128, 128, 12]] as const) {
    const registry = new EndpointRegistry();
    const activation = await adapter.activate({
      hostStateRoot: tmpdir(), dataRoot: tmpdir(), instance: "render", pool: "machine",
      config: canonicalize({ workers, defaultConcurrency: 2, browserCapacity }),
    });
    await installEndpoint(activation.endpoint, registry);
    const selected = registry.select(request);
    assert.equal(selected.status, "resolved");
    const claims = endpointResourceClaims(selected.registration.scheduling!, request);
    assert.deepEqual(claims.at(-1), { id: "capacity:machine/browsers", limit: browserCapacity, units: expectedUnits });
    const single = { ...request, constraints: canonicalize({ program: document, range: { startFrame: 7, endFrameExclusive: 8 } }) };
    assert.deepEqual(endpointResourceClaims(selected.registration.scheduling!, single).at(-1),
      { id: "capacity:machine/browsers", limit: browserCapacity, units: 1 });
  }
});
