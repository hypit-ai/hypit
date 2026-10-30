import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mediaTypes } from "@hypit/media";
import assert from "node:assert/strict";
import { MemoryResourceStore } from "@hypit/executor";
import { htmlProgramCapabilities, htmlProgramTypes, htmlRasterRequest } from "@hypit/html-program";
import { endpointOffers } from "@hypit/endpoint";

import {
  createLocalChromiumHtmlProvider,
  rasterizeChromiumHtmlProgram,
} from "../src/index.js";
import { createLocalElectronHtmlProvider } from "../src/electron-implementation.js";
import { localChromiumHtmlRendererProgram, localElectronHtmlRendererProgram } from "../src/program.js";
import { htmlProviderDelivery, htmlProviderDocument, htmlProviderHandler, htmlProviderNeed } from "./provider-scenario.js";

test("rendering with a missing selection fails without installing or substituting a browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-missing-render-browser-"));
  try {
    for (const selection of [
      { browserVersion: "0.0.0.1", browserCacheDirectory: directory },
      { chromePath: join(directory, "missing-browser") },
    ]) {
      await assert.rejects(rasterizeChromiumHtmlProgram({ program: htmlProviderDocument(), delivery: htmlProviderDelivery() }, {
        ...selection, resources: new MemoryResourceStore(),
      }), /HTML browser is unavailable/u);
      assert.deepEqual(await readdir(directory), []);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("local HTML renderer Provider exposes visual and frame capabilities and two separate concurrency levels", async () => {
  const provider = createLocalChromiumHtmlProvider({ workers: 4, defaultConcurrency: 2 });
  assert.equal(provider.instance.id, "html.local");
  const offers = endpointOffers(provider);
  assert.deepEqual(offers.map(({ supports: _supports, ...offer }) => offer), [{
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual,
    endpoint: "html.local",
  }, { capability: htmlProgramCapabilities.rasterizeFrames, returns: htmlProgramTypes.frameImages, endpoint: "html.local" }]);
  assert.equal(offers.every(offer => typeof offer.supports === "function"), true);
  const visual = offers.find(offer => offer.capability.name === htmlProgramCapabilities.rasterizeVisual.name)!;
  assert.deepEqual(visual.supports!({ capability: visual.capability, returns: visual.returns,
    constraints: htmlRasterRequest(htmlProviderDocument(), htmlProviderDelivery()) }), { status: "supported" });
  const resolved = await htmlProviderHandler(htmlProviderNeed());
  assert.equal(resolved.registration.scheduling?.resources.find((item) =>
    item.id.startsWith("pool:"))?.limit, 1,
    "Runtime request admission must remain separate from HTML renderer frame workers");
});

test("Electron is an explicit encoded-visual implementation, not a fallback or PNG-frame endpoint", () => {
  const provider = createLocalElectronHtmlProvider({
    electronPath: "/configured/Electron",
  });
  assert.deepEqual(endpointOffers(provider).map(({ supports: _supports, ...offer }) => offer), [{
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual,
    endpoint: "html.local",
  }]);
  const visual = endpointOffers(provider)[0]!;
  assert.deepEqual(visual.supports!({ capability: visual.capability, returns: visual.returns,
    constraints: htmlRasterRequest(htmlProviderDocument(), htmlProviderDelivery()) }), {
    status: "supported",
  });
  assert.throws(() => createLocalChromiumHtmlProvider({ electronPath: "/configured/Electron" } as never),
    /electronPath requires renderer electron/u);
  assert.throws(() => createLocalElectronHtmlProvider({
    electronPath: "/configured/Electron",
    chromePath: "/configured/Chrome",
  } as never), /cannot combine Chrome selection options/u);
  assert.throws(() => createLocalElectronHtmlProvider({
    electronPath: "/configured/Electron",
    browserGpu: "software",
  }), /requires browserGpu auto or hardware/u);
});

test("the selected HTML renderer Provider owns one idempotent browser installation", () => {
  const program = localChromiumHtmlRendererProgram({
    id: "html.local",
    nodePath: process.execPath,
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "html.local");
  assert.equal(program.start, undefined);
  assert.match(program.installation!.commands[0]!.args.at(-3)!, /browser-install\.js$/u);
});

test("an explicitly selected Electron remains user-managed", () => {
  const program = localElectronHtmlRendererProgram({
    id: "html.gpu",
    electronPath: "/configured/Electron",
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "html.gpu");
  assert.equal(program.installation, undefined);
});
