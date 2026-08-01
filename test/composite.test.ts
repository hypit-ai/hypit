import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkSource, compileSource } from "../src/compiler.js";

const fixture = fileURLToPath(
  new URL("../examples/composite-speech-program/minimal.svml", import.meta.url),
);

test("composite-v1 expands finite internal Basis/Locator instances with audited aliases", async () => {
  const checked = await checkSource(fixture);
  assert.deepEqual(
    checked.plan.instances.map((instance) => instance.id).sort(),
    ["aroll", "main", "voice::basis", "voice::locator"],
  );
  assert.equal(checked.plan.expansions.length, 1);
  assert.deepEqual(checked.plan.expansions[0]?.internalIds, [
    "voice::basis",
    "voice::locator",
  ]);
  assert.deepEqual(checked.plan.expansions[0]?.exports, {
    production: "voice::basis.production",
    map: "voice::locator.map",
    "facets.visual": "voice::basis.facets.visual",
  });
  assert.equal(checked.lock.expansions[0]?.expansionDigest.length, 64);
  const internal = checked.plan.instances.find((instance) => instance.id === "voice::basis");
  assert.match(internal?.sourceMap?.callSite.file ?? "", /minimal\.svml$/u);
  assert.match(internal?.sourceMap?.definitionSite.file ?? "", /speech-program\.svk$/u);

  const compilation = await compileSource({ file: fixture });
  assert.equal(compilation.plan.kernels.some((kernel) =>
    kernel.ports.some((port) => port.type === "CaptionTrack")), false);
  assert.equal(compilation.located.durationFrames, 285);
  assert.equal(compilation.basis.sourceMaps.length, 4);
  assert.equal(compilation.basis.audio[0]?.fadeOutFrames, 15);
  assert.equal(compilation.basis.audio[1]?.fadeInFrames, 15);

  const visuals = compilation.projections.get("aroll")?.visuals ?? [];
  assert.deepEqual(
    visuals.map((visual) => [visual.startFrame, visual.endFrameExclusive, visual.mediaStartSec]),
    [[0, 150, 0], [135, 285, 5]],
  );
  assert.ok(visuals.every((visual) => visual.z === 100));
  assert.ok(visuals.every((visual) => /svml-program-bound/u.test(visual.css ?? "")));
});

test("a precomposed media Basis reuses the same Locator and Composition contracts", async () => {
  const file = fileURLToPath(new URL("./fixtures/media-basis/main.svml", import.meta.url));
  const compilation = await compileSource({ file });
  assert.equal(compilation.basis.basis.durationFrames, 30);
  assert.equal(compilation.basis.alignmentSubjects.length, 1);
  assert.equal(compilation.basis.sourceMaps.length, 2);
  assert.equal(compilation.semanticMap.anchors.length, 4);
  assert.equal(compilation.target.audios.length, 1);
});
