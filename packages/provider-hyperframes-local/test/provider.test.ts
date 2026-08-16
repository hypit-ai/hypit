import { spawnSync } from "node:child_process";
import test from "node:test";
import { mediaTypes, verifyRenderedVisual } from "@narratage/media";
import type { CompositableSurfaceRef, RenderedVisual } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import { sealComposition, sealVisualTrack } from "@narratage/composition";
import assert from "node:assert/strict";
import { MemoryArtifactStore, EndpointRegistry } from "@narratage/driver-node";
import type { EndpointRegistration } from "@narratage/driver-node";
import type { ImmediateEndpointHandler } from "@narratage/endpoint-kit";
import { compileHyperframesDocument } from "@narratage/hyperframes";
import { renderHyperframesCapabilities, hyperframesVisualRequest } from "@narratage/render-hyperframes";
import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue, Need } from "@narratage/protocol";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { createLocalHyperframesProvider } from "../src/index.js";
import { localHyperframesBrowserProgram } from "../src/program.js";

const liveEnabled = process.env.NARRATAGE_BROWSER_TESTS === "1";
const hasFfprobe = spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

function documentFixture(surface?: CompositableSurfaceRef) {
  const programSpace = sealProgramSpace({
    durationSec: 1,
    frameRate: { numerator: 12, denominator: 1 },
  });
  const track = sealVisualTrack({
    visualIr: "narratage.visual-ir@1",
    id: "provider-fixture",
    presents: [{
      id: "card",
      span: { startFrame: 0, endFrameExclusive: 12 },
      stacking: { order: 10, tieBreak: "card" },
      elements: [
        {
          id: "background",
          order: 0,
          kind: "box",
          style: [
            { name: "position", value: "absolute" },
            { name: "inset", value: 0 },
            { name: "background", value: "#261447" },
          ],
        },
        ...(surface === undefined ? [] : [{
          id: "surface",
          parent: "background",
          order: 1,
          kind: "surface" as const,
          surface,
          style: [
            { name: "position" as const, value: "absolute" },
            { name: "left" as const, value: "0px" },
            { name: "top" as const, value: "0px" },
            { name: "width" as const, value: "1px" },
            { name: "height" as const, value: "1px" },
          ],
        }]),
      ],
    }],
  });
  return compileHyperframesDocument(sealComposition({
    id: "local-hyperframes-provider-fixture",
    canvas: { width: 160, height: 96, clearColor: "#000000" },
    tracks: [track],
  }), programSpace);
}

function requestNeed(document = documentFixture()): Need {
  const constraints = hyperframesVisualRequest(document);
  return {
    id: "need:local-hyperframes-fixture",
    capability: renderHyperframesCapabilities.renderVisual,
    returns: mediaTypes.renderedVisual,
    constraints,
    result: "record:local-hyperframes-fixture",
  };
}

async function handlerFor(request: Need): Promise<{
  readonly handler: ImmediateEndpointHandler;
  readonly registration: EndpointRegistration;
}> {
  const registry = new EndpointRegistry();
  await createLocalHyperframesProvider({
    workers: 2,
    defaultConcurrency: 1,
    processTimeoutMs: 120_000,
  }).install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "immediate");
  return { handler: resolution.registration.handler, registration: resolution.registration };
}

test("local HyperFrames Provider exposes one exact visual capability and two separate concurrency levels", async () => {
  const provider = createLocalHyperframesProvider({ workers: 4, defaultConcurrency: 2 });
  assert.equal(provider.instance.id, "hyperframes.local");
  assert.deepEqual(provider.offers, [{
    capability: renderHyperframesCapabilities.renderVisual,
    returns: mediaTypes.renderedVisual,
    endpoint: "hyperframes.local",
  }]);
  const resolved = await handlerFor(requestNeed());
  assert.equal(resolved.registration.scheduling?.resources.find((item) =>
    item.id.startsWith("pool:"))?.maxActive, 1,
    "Runtime request admission must remain separate from HyperFrames frame workers");
});

test("the selected HyperFrames Provider owns one idempotent browser preparation", () => {
  const program = localHyperframesBrowserProgram({ dataRoot: "/project", instance: "hyperframes", config: {} });
  assert.equal(program.id, "hyperframes-browser");
  assert.equal(program.start, undefined);
  assert.deepEqual(program.prepare?.args.slice(-2), ["browser", "ensure"]);
});

test("local HyperFrames Provider really renders a silent frame-exact MP4 with parallel workers", {
  skip: !liveEnabled || !hasFfprobe,
}, async () => {
  const artifacts = new MemoryArtifactStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const surfaceArtifact = await artifacts.put(png, "image/png");
  const surface: CompositableSurfaceRef = {
    artifact: surfaceArtifact,
    width: 1,
    height: 1,
    colorSpace: "srgb",
    alphaMode: "straight",
    timing: { kind: "still" },
  };
  const request = requestNeed(documentFixture(surface));
  const { handler } = await handlerFor(request);
  const output = await handler({
    command: { kind: "fulfill-need", id: "command:local-hyperframes-fixture", need: request },
    need: request,
    artifacts,
    credentials: {},
  });
  assert.equal(output.value.kind, "inline");
  const value: CanonicalValue = output.value.kind === "inline" ? output.value.value : canonicalize(null);
  verifyRenderedVisual(value);
  const visual = value as unknown as RenderedVisual;
  assert.equal(visual.frameCount, 12);
  assert.deepEqual(visual.canvas, { width: 160, height: 96 });
  assert.equal(await artifacts.has(visual.artifact.digest), true);
});
