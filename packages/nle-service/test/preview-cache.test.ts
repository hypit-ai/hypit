import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { readNleProjectFile } from "@hypit/nle/node";

import { NlePreviewCache } from "../src/node/preview-cache.js";

test("picture media keeps its storyboard and exposes attached audio as a waveform decoration", async () => {
  const projectRoot = resolve("examples/ranking-debate");
  const projectFile = resolve(projectRoot, "film.nle.json");
  const session = await readNleProjectFile(projectFile);
  const observations = await new NlePreviewCache(projectRoot, projectFile).observations(session.current);
  const observed = observations.find((value) => value.item === "alice-video-1-use");

  assert.deepEqual(observed?.layers?.map((layer) => layer.kind === "preview" ? {
    role: layer.role,
    kind: layer.preview.kind,
    layout: layer.layout,
  } : layer), [{
    role: "content",
    kind: "video",
    layout: "filmstrip",
  }, {
    role: "decoration",
    kind: "audio",
    layout: "waveform",
  }]);
});
