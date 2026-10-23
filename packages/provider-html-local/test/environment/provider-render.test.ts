import assert from "node:assert/strict";
import test from "node:test";
import { MemoryResourceStore } from "@hypit/executor";
import { verifyTimelineVisual } from "@hypit/media";
import type { CompositableSurfaceRef, TimelineVisual } from "@hypit/media";
import type { CanonicalValue } from "@hypit/protocol";
import { rasterizeHtmlProgram } from "../../src/index.js";
import { browserExecutablePath } from "../../src/browser.js";
import { localHtmlBrowserProgram } from "../../src/program.js";
import { htmlProviderDocument, htmlProviderHandler, htmlProviderNeed } from "../provider-scenario.js";

test("an explicit browser renders without installing a managed replacement", async () => {
  const chromePath = process.env.HYPIT_TEST_CHROME_PATH ?? browserExecutablePath({});
  const program = localHtmlBrowserProgram({ chromePath, id: "external", nodePath: process.execPath, ffprobePath: "ffprobe" });
  assert.equal(program.installation, undefined);
  assert.equal((await program.probe()).state, "ready");
  const diagnostics: string[] = [];
  const visual = await rasterizeHtmlProgram({ program: htmlProviderDocument() }, {
    chromePath, resources: new MemoryResourceStore(), workers: 1,
    onDiagnostic: async event => { diagnostics.push(event.message); },
  });
  assert.equal(visual.frameCount, 12);
  assert.ok(diagnostics.some(message => message.includes(`browser ${chromePath}`)));
});

test("local HTML renderer Provider really renders a silent frame-exact MP4 with parallel workers", async () => {
  const resources = new MemoryResourceStore();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const surfaceArtifact = await resources.put(png, "image/png");
  const surface: CompositableSurfaceRef = {
    artifact: surfaceArtifact,
    width: 1,
    height: 1,
    colorSpace: "srgb",
    alphaMode: "straight",
    timing: { kind: "still" },
  };
  const request = htmlProviderNeed(htmlProviderDocument(surface));
  const { handler } = await htmlProviderHandler(request);
  const output = await handler({

    need: request, resources, credentials: {},
  });
  const value: CanonicalValue = output;
  verifyTimelineVisual(value);
  const visual = value as unknown as TimelineVisual;
  assert.equal(visual.frameCount, 12);
  assert.deepEqual(visual.canvas, { width: 160, height: 96 });
  assert.equal(await resources.has(visual.artifact.resource), true);
});
