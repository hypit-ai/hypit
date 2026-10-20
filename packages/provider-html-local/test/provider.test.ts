import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mediaTypes } from "@hypit/media";
import assert from "node:assert/strict";
import { MemoryResourceStore } from "@hypit/executor";
import { htmlProgramCapabilities, htmlProgramTypes, htmlRasterRequest } from "@hypit/html-program";
import { endpointOffers } from "@hypit/endpoint";

import { createLocalHtmlProvider, rasterizeHtmlProgram } from "../src/index.js";
import { localHtmlBrowserProgram } from "../src/program.js";
import { htmlProviderDocument, htmlProviderHandler, htmlProviderNeed } from "./provider-scenario.js";

test("rendering with a missing selection fails without installing or substituting a browser", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-missing-render-browser-"));
  try {
    for (const selection of [
      { browserVersion: "0.0.0.1", browserCacheDirectory: directory },
      { chromePath: join(directory, "missing-browser") },
    ]) {
      await assert.rejects(rasterizeHtmlProgram({ program: htmlProviderDocument() }, {
        ...selection, resources: new MemoryResourceStore(),
      }), /HTML browser is unavailable/u);
      assert.deepEqual(await readdir(directory), []);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("local HTML renderer Provider exposes visual and frame capabilities and two separate concurrency levels", async () => {
  const provider = createLocalHtmlProvider({ workers: 4, defaultConcurrency: 2 });
  assert.equal(provider.instance.id, "html.local");
  assert.deepEqual(endpointOffers(provider), [{
    capability: htmlProgramCapabilities.rasterizeVisual,
    returns: mediaTypes.timelineVisual,
    endpoint: "html.local",
  }, { capability: htmlProgramCapabilities.rasterizeFrames, returns: htmlProgramTypes.frameImages, endpoint: "html.local" }]);
  const resolved = await htmlProviderHandler(htmlProviderNeed());
  assert.equal(resolved.registration.scheduling?.resources.find((item) =>
    item.id.startsWith("pool:"))?.limit, 1,
    "Runtime request admission must remain separate from HTML renderer frame workers");
});

test("the selected HTML renderer Provider owns one idempotent browser installation", () => {
  const program = localHtmlBrowserProgram({
    id: "html.local",
    nodePath: process.execPath,
    ffprobePath: "ffprobe",
  });
  assert.equal(program.id, "html.local");
  assert.equal(program.start, undefined);
  assert.match(program.installation!.commands[0]!.args.at(-3)!, /browser-install\.js$/u);
});
