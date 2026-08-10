import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { discoverPreviewProducers } from "../tools/playground/src/discovery/producers.js";
import type { PreviewSources } from "../tools/playground/src/discovery/producers.js";

/**
 * A module that publishes a Recipe can be driven by one.
 *
 * The playground offers a Recipe form without knowing what a Recipe of that
 * kind contains: the module states the properties and performs the lowering.
 * These tests run that over the real workspace, so a module that starts or
 * stops publishing one changes the result here without anybody editing a list.
 */

const packages = fileURLToPath(new URL("../packages", import.meta.url));

function workspace(): PreviewSources {
  const manifests: Record<string, () => Promise<unknown>> = {};
  const components: Record<string, () => Promise<unknown>> = {};
  for (const dir of readdirSync(packages, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    manifests[`${dir.name}/manifest`] = async () => await import(`${packages}/${dir.name}/src/manifest.ts`);
    components[dir.name] = async () => await import(`${packages}/${dir.name}/src/component.ts`);
  }
  return { manifests, components };
}

const face = {
  contract: "svml.font-artifact@1",
  sources: [{
    artifact: { kind: "blob", digest: `sha256:${"a".repeat(64)}`, size: 8, mediaType: "font/woff2" },
  }],
  weight: 600,
  style: "normal",
};

/** What an operator would have typed, in the vocabulary a `.svs` uses. */
const written = {
  align: "center", background: "#09090BCC", "cue-max-words": 5, "cue-min-words": 2,
  fill: "#FFFFFF", font: "Inter", "line-height": 0.96, padding: "16 24", radius: 18,
  size: 58, "stack-order": 70, weight: 600, width: 0.84, x: 0.08, y: 0.76,
};

async function captionFine() {
  const found = await discoverPreviewProducers(workspace());
  const producer = found.find((entry) => entry.moduleName === "@narratage/caption-fine");
  assert.notEqual(producer, undefined, "caption-fine is not previewable");
  return producer!;
}

test("a published Recipe carries its own properties and formats", async () => {
  const facet = (await captionFine()).recipes[0];
  assert.notEqual(facet, undefined, "caption-fine publishes no Recipe");

  const fields = (facet!.schema as { fields: Record<string, { schema: { format?: string } }> }).fields;
  // The vocabulary is the author's, not the module's internals: a stylesheet
  // says `size`, never `fontSizePx`.
  assert.ok(Object.hasOwn(fields, "size"));
  assert.ok(!Object.hasOwn(fields, "fontSizePx"));
  assert.equal(fields["fill"]?.schema.format, "color");
  assert.equal(fields["x"]?.schema.format, "unit-fraction");
});

test("written properties lower to the Producer's own input", async () => {
  const producer = await captionFine();
  const filled = producer.recipes[0]!.apply(written, {
    program: { styles: [{ rendering: { parameters: { typography: { exactFonts: [face] } } } }] },
  } as never);

  // It answers for `program` and nothing else: the words, the timing and the
  // frame domain are a Build's to supply, not a stylesheet's.
  assert.deepEqual(Object.keys(filled), ["program"]);

  const program = filled["program"] as unknown as {
    styles: readonly { rendering: { parameters: { typography: { fontSizePx: number } } } }[];
  };
  assert.equal(program.styles.length, 1);
  assert.equal(program.styles[0]!.rendering.parameters.typography.fontSizePx, 58);
});

test("a Recipe with no face to render says so rather than inventing one", async () => {
  const producer = await captionFine();
  assert.throws(() => producer.recipes[0]!.apply(written, {}), /exact Font/u);
});

test("a module publishing no Recipe simply has none", async () => {
  const found = await discoverPreviewProducers(workspace());
  const speech = found.find((entry) => entry.moduleName === "@narratage/speech-basis");
  assert.notEqual(speech, undefined);
  assert.deepEqual(speech!.recipes, []);
});
