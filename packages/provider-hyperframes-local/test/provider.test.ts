import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  contractTypes,
  sealComposition,
  sealProgramSpace,
  sealVisualTrack,
  verifyRenderedVisual,
} from "@svml/contracts";
import type { RenderedVisual } from "@svml/contracts";
import { MemoryArtifactStore, EndpointRegistry } from "@svml/driver-node";
import type { EndpointRegistration } from "@svml/driver-node";
import type { ImmediateEndpointHandler } from "@svml/endpoint-kit";
import { compileHyperframesDocument } from "@svml/hyperframes";
import { hyperframesRenderCapabilities, hyperframesVisualRequest } from "@svml/hyperframes-render";
import { canonicalize, digestOf } from "@svml/protocol";
import type { CanonicalValue, Need } from "@svml/protocol";

import { createLocalHyperframesProvider } from "../src/index.js";

const liveEnabled = process.env.SVML_BROWSER_TESTS === "1";
const hasFfprobe = spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;

function documentFixture() {
  const programSpace = sealProgramSpace({
    contract: "svml.program-space@0",
    durationSec: 1,
    frameRate: { numerator: 12, denominator: 1 },
  });
  const track = sealVisualTrack({
    contract: "svml.visual-track@1",
    visualIr: "svml.hyperframes-visual-ir@1",
    id: "provider-proof",
    programSpaceDigest: programSpace.digest,
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
        {
          id: "title",
          parent: "background",
          order: 1,
          kind: "text",
          text: "SVML",
          style: [
            { name: "position", value: "absolute" },
            { name: "left", value: "28px" },
            { name: "top", value: "28px" },
            { name: "font-family", value: "sans-serif" },
            { name: "font-size", value: "24px" },
            { name: "font-weight", value: 700 },
            { name: "color", value: "#ffffff" },
          ],
        },
      ],
    }],
  });
  return compileHyperframesDocument(sealComposition({
    contract: "svml.composition@1",
    id: "local-hyperframes-provider-proof",
    programSpace,
    canvas: { width: 160, height: 96, clearColor: "#000000" },
    tracks: [track],
  }));
}

function requestNeed(): Need {
  const constraints = hyperframesVisualRequest(documentFixture());
  return {
    id: "need:local-hyperframes-proof",
    capability: hyperframesRenderCapabilities.renderVisual,
    returns: contractTypes.renderedVisual,
    constraints,
    requestedBy: "derivation:local-hyperframes-proof",
    result: "record:local-hyperframes-proof",
    accepts: "exact",
    conformanceFloor: "exact",
    requestDigest: digestOf({
      capability: hyperframesRenderCapabilities.renderVisual,
      returns: contractTypes.renderedVisual,
      constraints,
    }),
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
  assert.equal(provider.name, "hyperframes.local");
  const facet = provider.manifest.facets[0];
  assert.equal(facet?.role, "capability-endpoint");
  assert(facet?.role === "capability-endpoint");
  assert.deepEqual(facet.permissions, ["process:hyperframes"]);
  assert.equal(facet.defaultConcurrency, 2);
  assert.deepEqual(provider.bindings, [{
    capability: hyperframesRenderCapabilities.renderVisual,
    returns: contractTypes.renderedVisual,
    endpoint: "hyperframes.local",
  }]);
  const resolved = await handlerFor(requestNeed());
  assert.equal(resolved.registration.scheduling?.maxConcurrency, 1,
    "Runtime request admission must remain separate from HyperFrames frame workers");
});

test("local HyperFrames Provider really renders a silent frame-exact MP4 with parallel workers", {
  skip: !liveEnabled || !hasFfprobe,
}, async () => {
  const request = requestNeed();
  const { handler } = await handlerFor(request);
  const artifacts = new MemoryArtifactStore();
  const output = await handler({
    command: { kind: "fulfill-need", id: "command:local-hyperframes-proof", need: request },
    need: request,
    artifacts,
    credentials: {},
  });
  assert.equal(output.conformance, "exact");
  assert.equal(output.delivery, "executed");
  assert.equal(output.value.kind, "inline");
  const value: CanonicalValue = output.value.kind === "inline" ? output.value.value : canonicalize(null);
  verifyRenderedVisual(value);
  const visual = value as unknown as RenderedVisual;
  assert.equal(visual.renderInputDigest, documentFixture().digest);
  assert.equal(visual.frameCount, 12);
  assert.deepEqual(visual.canvas, { width: 160, height: 96 });
  assert.equal(visual.muted, true);
  assert.equal(await artifacts.has(visual.artifact.digest), true);
});
