import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { endpointOffers } from "@hypit/hypit/endpoint";
import { htmlProgramCapabilities, htmlRasterRequest } from "@hypit/html-program";
import { mediaTypes } from "@hypit/media";
import { canonicalize } from "@hypit/hypit/protocol";
import {
  runtimeEndpointAdapterFacetAbi,
} from "@hypit/runtime-local/extension";
import type { RuntimeEndpointAdapterImplementation } from "@hypit/runtime-local/extension";

import { hypitPackage } from "../src/activation.js";
import { createLocalElectronHtmlProvider } from "../src/provider.js";
import { localElectronHtmlRendererProgram } from "../src/program.js";
import {
  htmlProviderDelivery,
  htmlProviderDocument,
} from "../../provider-html-local/test/provider-scenario.js";

test("Electron exposes one encoded-visual Endpoint", () => {
  const provider = createLocalElectronHtmlProvider({ electronPath: "/configured/Electron" });
  assert.deepEqual(endpointOffers(provider).map(({ supports: _supports, ...offer }) => offer), [{
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual,
    endpoint: "html.electron.local",
  }]);
  const visual = endpointOffers(provider)[0]!;
  assert.deepEqual(visual.supports!({ capability: visual.capability, returns: visual.returns,
    constraints: htmlRasterRequest(htmlProviderDocument(), htmlProviderDelivery()) }), { status: "supported" });
  assert.throws(() => createLocalElectronHtmlProvider({
    electronPath: "/configured/Electron",
    browserGpu: "software",
  }), /requires browserGpu auto or hardware/u);
});

test("Electron remains a user-managed Program", () => {
  const program = localElectronHtmlRendererProgram({
    id: "html.gpu",
    electronPath: "/configured/Electron",
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "html.gpu");
  assert.equal(program.installation, undefined);
});

test("Runtime Profile activates Electron without constructing a managed Chrome Program", async () => {
  const facet = hypitPackage.facets.find(item => item.abi === runtimeEndpointAdapterFacetAbi);
  assert.ok(facet);
  const adapter = facet.implementation as RuntimeEndpointAdapterImplementation;
  const activation = await adapter.activate({
    hostStateRoot: tmpdir(), dataRoot: tmpdir(), instance: "html.gpu", pool: "machine",
    config: canonicalize({ electronPath: "Electron" }),
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
