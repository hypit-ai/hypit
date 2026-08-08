import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertHyperframesDocument, compileHyperframesDocument } from "@narratage/hyperframes";
import { sealComposition } from "@narratage/composition";
import { sealProgramSpace } from "@narratage/program-space";

import { discoverPreviewProducers } from "../tools/playground/src/discovery/producers.js";
import type { PreviewSources } from "../tools/playground/src/discovery/producers.js";

/**
 * The playground lists no components. It finds them, by asking the manifests
 * which modules declare a Producer that outputs a VisualTrack.
 *
 * These tests run that discovery over the real workspace, so a module that
 * gains or loses a visual Producer changes the result here without anybody
 * editing a list — which is the property the whole arrangement exists for.
 */

const packages = fileURLToPath(new URL("../packages", import.meta.url));

function workspace(): PreviewSources {
  const entries: Record<string, () => Promise<unknown>> = {};
  const components: Record<string, () => Promise<unknown>> = {};
  for (const dir of readdirSync(packages, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    // A small module states its manifest in its entry rather than in a file of
    // its own, and a Producer taking one of its types still needs the schema.
    entries[`${dir.name}/manifest`] = async () => await import(`${packages}/${dir.name}/src/manifest.ts`);
    entries[`${dir.name}/index`] = async () => await import(`${packages}/${dir.name}/src/index.ts`);
    components[dir.name] = async () => await import(`${packages}/${dir.name}/src/component.ts`);
  }
  return { manifests: entries, components };
}

const programSpace = sealProgramSpace({
  contract: "svml.program-space@1",
  durationSec: 4,
  frameRate: { numerator: 30, denominator: 1 },
});
const canvas = { width: 1080, height: 1920, clearColor: "#09090b" };

test("previewable modules are the ones declaring a VisualTrack Producer", async () => {
  const found = await discoverPreviewProducers(workspace());
  assert.deepEqual(
    [...new Set(found.map((producer) => producer.moduleName))].sort(),
    ["@narratage/broll", "@narratage/caption", "@narratage/speech-basis", "@narratage/text-track"],
  );
});

test("each producer carries its inputs' declared schemas", async () => {
  for (const producer of await discoverPreviewProducers(workspace())) {
    assert.ok(producer.inputs.length > 0, `${producer.id} declares no inputs`);
    for (const input of producer.inputs) {
      assert.notEqual(input.schema, undefined,
        `${producer.id} input ${input.name} has no schema, so no form can be built for it`);
    }
  }
});

test("a producer whose inputs all carry defaults renders without anything being typed", async () => {
  const found = await discoverPreviewProducers(workspace());
  const ready = found.filter((producer) =>
    producer.inputs.every((input) => input.initial !== undefined));

  // The modules that can answer for themselves entirely: caption and text.
  // B-roll and speech take content-addressed media, which no module can default.
  assert.ok(ready.length >= 2, "at least two producers should be fully defaulted");

  for (const producer of ready) {
    const values = Object.fromEntries(producer.inputs.map((input) =>
      [input.name, input.type.name === "ProgramSpace" ? programSpace : input.initial]));
    const track = producer.invoke(values as never);
    const document = compileHyperframesDocument(sealComposition({
      contract: "svml.composition@1",
      id: producer.moduleName,
      canvas,
      tracks: [track as never],
    }), programSpace);
    assert.doesNotThrow(() => assertHyperframesDocument(document),
      `${producer.id} produced an illegal document from its own declared defaults`);
    assert.match(document.html, /class="clip svml-visual-present"/u);
  }
});

test("a module offering no default for a media input says so rather than inventing one", async () => {
  const found = await discoverPreviewProducers(workspace());
  // B-roll and speech both take a value carrying a content-addressed Artifact,
  // and a module has no bytes to point at, so neither offers a default. Saying
  // nothing is the honest answer; a stub digest would be rejected downstream.
  for (const moduleName of ["@narratage/broll", "@narratage/speech-basis"]) {
    const producer = found.find((entry) => entry.moduleName === moduleName)!;
    assert.ok(producer.inputs.some((input) => input.initial === undefined),
      `${moduleName} should decline to default its media-bearing input`);
  }
});

test("each producer is discovered once, however many files re-export its module", async () => {
  const found = await discoverPreviewProducers(workspace());
  assert.equal(new Set(found.map((producer) => producer.id)).size, found.length);
});
