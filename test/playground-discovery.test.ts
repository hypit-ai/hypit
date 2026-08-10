import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
    // The browser follows this same dedicated metadata boundary. Importing
    // package indexes would pull Node-only Providers and Drivers into Vite.
    entries[`${dir.name}/manifest`] = async () => await import(`${packages}/${dir.name}/src/manifest.ts`);
    components[dir.name] = async () => await import(`${packages}/${dir.name}/src/component.ts`);
  }
  return { manifests: entries, components };
}

test("an arbitrary supplied visual module is discovered without registration", async () => {
  const module = { name: "@example/visual", version: "1" } as const;
  const input = { module, name: "Input" } as const;
  const track = {
    module: { name: "@narratage/composition", version: "1" },
    name: "VisualTrack",
  } as const;
  const implementation = {
    kind: "registered", locator: "@example/visual/render",
    digest: `sha256:${"0".repeat(64)}`,
  } as const;

  const found = await discoverPreviewProducers({
    manifests: {
      arbitrary: async () => ({ manifest: {
        format: "svml.module@1", name: module.name, version: module.version,
        dependencies: [], capabilities: [], surfaces: [],
        types: [{ name: input.name, schema: { kind: "string" } }],
        producers: [{
          name: "render", inputs: [{ name: "input", type: input }],
          outputs: [{ name: "track", type: track }], needs: [], implementation,
        }],
      } }),
    },
    components: {
      arbitrary: async () => ({ component: {
        name: module.name,
        producers: [{
          producer: { module, name: "render" },
          handler: () => ({ outputs: { track: { value: "arbitrary-output" } } }),
        }],
      } }),
    },
  });

  assert.equal(found.length, 1);
  assert.equal(found[0]?.id, "@example/visual#render");
  assert.deepEqual(found[0]?.inputs.map((entry) => entry.name), ["input"]);
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

test("discovery never obtains authored values from production type declarations", async () => {
  const found = await discoverPreviewProducers(workspace());
  for (const producer of found) {
    for (const input of producer.inputs) {
      assert.deepEqual(Object.keys(input).sort(), ["name", "schema", "type"]);
    }
  }
});

test("each producer is discovered exactly once", async () => {
  const found = await discoverPreviewProducers(workspace());
  assert.equal(new Set(found.map((producer) => producer.id)).size, found.length);
});
