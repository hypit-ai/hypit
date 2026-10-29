import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ResourceIOOptions } from "@hypit/runtime";
import { EndpointRegistry, MemoryResourceStore } from "@hypit/executor";
import { rasterizeHtmlProgram } from "../src/index.js";
import { resolveExecutionOptions } from "../src/render.js";
import { hypitPackage } from "../src/activation.js";
import { runtimeEndpointAdapterFacetAbi } from "@hypit/runtime-local/extension";
import type { RuntimeEndpointAdapterImplementation } from "@hypit/runtime-local/extension";
import { endpointOffers, endpointResourceClaims, installEndpoint } from "@hypit/endpoint";
import { htmlProgramCapabilities } from "@hypit/html-program";
import { mediaTypes } from "@hypit/media";
import { canonicalize } from "@hypit/protocol";
import { distributeFrameRange, requestedFrameRanges, sourceFrameAt, sourceWindows, videoSlots } from "../src/sampling.js";
import { htmlNestedRangeDocument, htmlRangeDocument } from "./range-scenario.js";
import { htmlProviderDelivery } from "./provider-scenario.js";

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
  await assert.rejects(rasterizeHtmlProgram({ program: document, delivery: htmlProviderDelivery() }, { resources, chromePath: process.execPath, processTimeoutMs: 100 }),
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

test("source selection retains loop, hold, fractional-speed and reverse sampling and shares decoded frames", () => {
  const document = htmlRangeDocument({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
  const slots = videoSlots(document.videoSources, resource => `media://${resource}`,
    { frameRate: document.frameRate });
  assert.ok(slots.every(slot => slot.src === "media://res_range_source"));
  assert.equal(slots.length, 1, "the terminal plan retains one source occurrence and its complete Map");
  const timestampIndex = { timestamps: [0n, 1n, 2n, 3n],
    timeBase: { numerator: 1n, denominator: 30n } };
  const frames = new Map([[slots[0]!.sourceKey, timestampIndex]]);
  const range = { startFrame: 3, endFrameExclusive: 11 };
  const sampled = Array.from({ length: 8 }, (_, i) => {
    const frame = range.startFrame + i;
    return sourceFrameAt(slots[0]!, frame, timestampIndex);
  });
  assert.deepEqual(sampled, [1, 2, 3, 3, 3, 0, 0, 1]);
  assert.deepEqual(sourceWindows(slots, range, frames)[0]?.windows, [{ startFrame: 0, endFrameExclusive: 4 }]);
  assert.deepEqual(distributeFrameRange(range, 3), [
    { startFrame: 3, endFrameExclusive: 5 }, { startFrame: 5, endFrameExclusive: 8 },
    { startFrame: 8, endFrameExclusive: 11 },
  ]);
});

test("a nested Composition composes its occurrence Map with its media Map without materializing a child video", () => {
  const document = htmlNestedRangeDocument({ kind: "blob", resource: "res_nested_range_source",
    size: 1, mediaType: "video/mp4" });
  const slots = videoSlots(document.videoSources, resource => `media://${resource}`,
    { frameRate: document.frameRate });
  assert.equal(slots.length, 1);
  assert.equal(slots[0]!.documentPath.length, 1);
  const timestampIndex = { timestamps: [0n, 1n, 2n, 3n],
    timeBase: { numerator: 1n, denominator: 30n } };
  const childFrames = [2, 3, 0, 1, 2, 3, 3, 3, 0, 0, 1, 1, 3, 2, 1, 0, 3, 2];
  assert.deepEqual(Array.from({ length: 36 }, (_, frame) => sourceFrameAt(slots[0]!, frame, timestampIndex)),
    childFrames.flatMap(frame => [frame, frame]));
});

test("reverse source time selects the same bounded decoded window without forward traversal", () => {
  const [slot] = videoSlots([{ id: "reverse", documentPath: [], elementId: "reverse",
    artifactId: "artifact-reverse", startFrame: 0, endFrameExclusive: 4,
    sourceFrame: { numerator: 4, denominator: 1 }, sourceRate: { numerator: -1, denominator: 1 },
    kind: "surface", sourceFrameRate: { numerator: 30, denominator: 1 } }], () => "direct.mp4",
  { frameRate: { numerator: 30, denominator: 1 } });
  assert.ok(slot !== undefined);
  assert.deepEqual(Array.from({ length: 4 }, (_, frame) => sourceFrameAt(slot, frame)), [3, 2, 1, 0]);
  assert.deepEqual(sourceWindows([slot], { startFrame: 0, endFrameExclusive: 4 }, new Map()), [{
    sourceKey: "direct.mp4\u00000", src: "direct.mp4", streamIndex: 0,
    windows: [{ startFrame: 0, endFrameExclusive: 4 }],
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

test("HTML claims actual browser count including a range shorter than workers", async () => {
  const document = htmlRangeDocument({ kind: "blob", resource: "res_range_source", size: 1, mediaType: "video/mp4" });
  const request = { id: "visual", capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual, constraints: canonicalize({ program: document, delivery: htmlProviderDelivery() }), result: "visual-result" };
  const facet = hypitPackage.facets.find((item) => item.abi === runtimeEndpointAdapterFacetAbi);
  assert.ok(facet);
  const adapter = facet.implementation as RuntimeEndpointAdapterImplementation;
  for (const [workers, browserCapacity, expectedUnits] of [[4, 6, 4], [128, 128, 18]] as const) {
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
    const single = { ...request, constraints: canonicalize({ program: document, delivery: htmlProviderDelivery(), range: { startFrame: 7, endFrameExclusive: 8 } }) };
    assert.deepEqual(endpointResourceClaims(selected.registration.scheduling!, single).at(-1),
      { id: "capacity:machine/browsers", limit: browserCapacity, units: 1 });
  }
});

test("Runtime Profile selects Electron explicitly without constructing a managed Chrome program", async () => {
  const facet = hypitPackage.facets.find(item => item.abi === runtimeEndpointAdapterFacetAbi);
  assert.ok(facet);
  const adapter = facet.implementation as RuntimeEndpointAdapterImplementation;
  const activation = await adapter.activate({
    hostStateRoot: tmpdir(), dataRoot: tmpdir(), instance: "html.gpu", pool: "machine",
    config: canonicalize({ renderer: "electron", electronPath: "Electron" }),
  });
  assert.equal(activation.program?.installation, undefined);
  const offers = endpointOffers(activation.endpoint);
  assert.deepEqual(offers.map(({ supports: _supports, ...offer }) => offer), [{
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual,
    endpoint: "html.gpu",
  }]);
  assert.equal(typeof offers[0]!.supports, "function");
});
