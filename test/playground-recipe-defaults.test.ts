import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { discoverPreviewProducers } from "../tools/playground/src/discovery/producers.js";
import type { PreviewSources } from "../tools/playground/src/discovery/producers.js";

/**
 * A published Recipe opens on something legible.
 *
 * A form built from a schema alone starts at zero, and zero is a Recipe no
 * decoder accepts — so a tool offering one would open on an error the operator
 * has not caused. The module states a starting point instead, and these tests
 * hold it to being a real one rather than a plausible-looking literal.
 *
 * A starting point is exactly the required set, and for a vocabulary that
 * requires nothing that set is empty. Stating more would be worse than stating
 * nothing: an absent property takes the decoder's own fallback, so a value
 * repeated out of it only hides where it came from and freezes a choice the
 * module is still free to revise.
 */

const packages = fileURLToPath(new URL("../packages", import.meta.url));

function workspace(): PreviewSources {
  const manifests: Record<string, () => Promise<unknown>> = {};
  const components: Record<string, () => Promise<unknown>> = {};
  for (const dir of readdirSync(packages, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    manifests[dir.name] = async () => await import(`${packages}/${dir.name}/src/manifest.ts`);
    components[dir.name] = async () => await import(`${packages}/${dir.name}/src/component.ts`);
  }
  return { manifests, components };
}

async function facets() {
  const found = await discoverPreviewProducers(workspace());
  const seen = new Map<string, { module: string; facet: (typeof found)[number]["recipes"][number] }>();
  for (const producer of found) {
    for (const facet of producer.recipes) {
      const key = `${producer.moduleName}#${facet.surface}#${
        Object.keys((facet.schema as { fields?: object }).fields ?? {}).length}`;
      if (!seen.has(key)) seen.set(key, { module: producer.moduleName, facet });
    }
  }
  return [...seen.values()];
}

test("a starting point states exactly what its schema requires", async () => {
  const published = await facets();
  assert.ok(published.length > 0, "no module publishes a Recipe");
  for (const { module, facet } of published) {
    const fields = (facet.schema as {
      fields: Record<string, { optional?: true }>;
    }).fields;
    const required = Object.entries(fields)
      .filter(([, field]) => field.optional !== true)
      .map(([name]) => name)
      .sort();
    assert.deepEqual(Object.keys(facet.defaults).sort(), required,
      `${module} ${facet.surface} does not state its required set`);
  }
});

test("a starting point lowers, or says what media it is missing", async () => {
  // Lowering is the only test of a Recipe that a literal cannot fake. Where a
  // module needs bytes nothing here has, its own message is the right answer —
  // what must not happen is a silent wrong value or an error naming something
  // other than the media.
  for (const { module, facet } of await facets()) {
    try {
      const filled = facet.apply(facet.defaults, {});
      assert.deepEqual(Object.keys(filled), ["program"],
        `${module} ${facet.surface} answered for ${Object.keys(filled).join(", ")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /font|face|artifact|media|source/iu,
        `${module} ${facet.surface} failed on its own defaults: ${message}`);
    }
  }
});
