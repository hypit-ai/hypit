import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mediaTypes, sealVisualDeliverySpec, sealOutputPictureSpec } from "@hypit/media";
import assert from "node:assert/strict";
import { MemoryResourceStore } from "@hypit/executor";
import { htmlProgramCapabilities, htmlProgramTypes, htmlRasterRequest } from "@hypit/html-program";
import { endpointOffers } from "@hypit/endpoint";

import { createLocalHtmlProvider, rasterizeHtmlProgram } from "../src/index.js";
import { localHtmlRendererProgram } from "../src/program.js";
import { htmlProviderDelivery, htmlProviderDocument, htmlProviderHandler, htmlProviderHdr10Delivery, htmlProviderHdrStaticMetadata,
  htmlProviderNestedDocument,
  htmlProviderHdrDocument, htmlProviderNeed } from "./provider-scenario.js";

test("nested HTML documents stay inert until their occurrence enters the render selection", () => {
  const document = htmlProviderNestedDocument();
  assert.match(document.html, /data-hypit-nested-srcdoc=/u);
  assert.match(document.html, /data-hypit-nested-frame-(?:runs|values)=/u);
  assert.doesNotMatch(document.html, /data-hypit-nested-frame-map=/u);
  assert.doesNotMatch(document.html, /\ssrcdoc=/u);
  assert.match(document.html, /projectedSpans/u);
});

test("non-nested HTML documents do not carry nested Composition runtime", () => {
  const document = htmlProviderDocument();
  assert.doesNotMatch(document.html, /data-hypit-nested-/u);
  assert.doesNotMatch(document.html, /nestedCompositions|projectedSpans|nestedFrameAt/u);
});

test("rendering with a missing selection fails without installing or substituting a browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-missing-render-browser-"));
  try {
    for (const selection of [
      { browserVersion: "0.0.0.1", browserCacheDirectory: directory },
      { chromePath: join(directory, "missing-browser") },
    ]) {
      await assert.rejects(rasterizeHtmlProgram({ program: htmlProviderDocument(), delivery: htmlProviderDelivery() }, {
        ...selection, resources: new MemoryResourceStore(),
      }), /HTML browser is unavailable/u);
      assert.deepEqual(await readdir(directory), []);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("local HTML renderer Provider exposes visual and frame capabilities and two separate concurrency levels", async () => {
  const provider = createLocalHtmlProvider({ workers: 4, defaultConcurrency: 2 });
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
  const provider = createLocalHtmlProvider({
    renderer: "electron",
    electronPath: "/configured/Electron",
  });
  assert.deepEqual(endpointOffers(provider).map(({ supports: _supports, ...offer }) => offer), [{
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual,
    endpoint: "html.local",
  }]);
  const visual = endpointOffers(provider)[0]!;
  assert.deepEqual(visual.supports!({ capability: visual.capability, returns: visual.returns,
    constraints: htmlRasterRequest(htmlProviderHdrDocument(), htmlProviderHdr10Delivery()) }), {
    status: "supported",
  });
  assert.throws(() => createLocalHtmlProvider({ electronPath: "/configured/Electron" }),
    /electronPath requires renderer electron/u);
  assert.throws(() => createLocalHtmlProvider({ renderer: "electron" }),
    /requires an explicit electronPath/u);
  assert.throws(() => createLocalHtmlProvider({
    renderer: "electron",
    electronPath: "/configured/Electron",
    chromePath: "/configured/Chrome",
  }), /cannot combine Chrome selection options/u);
  assert.throws(() => createLocalHtmlProvider({
    renderer: "electron",
    electronPath: "/configured/Electron",
    browserGpu: "software",
  }), /requires browserGpu auto or hardware/u);
});

test("the local Endpoint rejects unsupported picture and delivery requests before execution", () => {
  const offers = endpointOffers(createLocalHtmlProvider({ workers: 1 }));
  const visual = offers.find(offer => offer.capability.name === htmlProgramCapabilities.rasterizeVisual.name)!;
  const frames = offers.find(offer => offer.capability.name === htmlProgramCapabilities.rasterizeFrames.name)!;
  const hdrProgram = { ...htmlProviderDocument(), picture: {
    colorPrimaries: "bt2020", colorTransfer: "linear", referenceWhiteNits: 203, alphaMode: "premultiplied",
  } as const };
  assert.deepEqual(visual.supports!({ capability: visual.capability, returns: visual.returns,
    constraints: htmlRasterRequest(hdrProgram, htmlProviderDelivery()) }), {
    status: "unsupported", reason: "The local HTML SDR pipeline requires the sRGB BT.709 100-nit working picture",
  });

  const hdrDelivery = sealVisualDeliverySpec({
    picture: { colorPrimaries: "bt2020", colorTransfer: "pq", colorMatrix: "bt2020-ncl",
      colorRange: "limited", bitDepth: 10, alpha: { mode: "opaque", matte: "#000000" } },
    encoding: { codec: "hevc", pixelFormat: "yuv420p10le", quality: "standard" },
    hdrStaticMetadata: htmlProviderHdrStaticMetadata(),
  });
  assert.deepEqual(visual.supports!({ capability: visual.capability, returns: visual.returns,
    constraints: htmlRasterRequest(htmlProviderDocument(), hdrDelivery) }), {
    status: "unsupported", reason: "The local HTML HDR10 pipeline requires a linear BT.709 working picture with explicit reference white",
  });

  const tenBitFrame = sealOutputPictureSpec({
    colorPrimaries: "bt709", colorTransfer: "srgb", colorMatrix: "rgb", colorRange: "full", bitDepth: 10,
    alpha: { mode: "opaque", matte: "#000000" },
  });
  assert.deepEqual(frames.supports!({ capability: frames.capability, returns: frames.returns,
    constraints: { program: htmlProviderDocument(), picture: tenBitFrame, frames: [0] } }), {
    status: "unsupported", reason: "The local HTML Provider currently implements only opaque sRGB 8-bit PNG frame delivery",
  });
});

test("the selected HTML renderer Provider owns one idempotent browser installation", () => {
  const program = localHtmlRendererProgram({
    id: "html.local",
    nodePath: process.execPath,
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "html.local");
  assert.equal(program.start, undefined);
  assert.match(program.installation!.commands[0]!.args.at(-3)!, /browser-install\.js$/u);
});

test("an explicitly selected Electron remains user-managed", () => {
  const program = localHtmlRendererProgram({
    id: "html.gpu",
    renderer: "electron",
    electronPath: "/configured/Electron",
    nodePath: process.execPath,
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "html.gpu");
  assert.equal(program.installation, undefined);
});
