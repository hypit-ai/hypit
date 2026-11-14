import assert from "node:assert/strict";
import test from "node:test";

import {
  createGenerationModuleFacet,
  generationModulesFromFacets,
} from "@hypit/generation-build";
import { createModuleFacet, modulesFromFacets } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

const manifest: GenerationModuleDefinition = {
  name: "@example/generator",
  dependencies: [],
  types: ["Prompt", "Image"],
  capabilities: [{
    name: "generate-image",
    returns: { module: { name: "@example/generator" }, name: "Image" },
  }],
  producers: [{
    name: "request-image",
    inputs: [{
      name: "prompt",
      type: { module: { name: "@example/generator" }, name: "Prompt" },
    }],
    result: {
      kind: "need",
      name: "image",
      capability: { module: { name: "@example/generator" }, name: "generate-image" },
    },
  }],
};

test("Module and Generation declarations cross distinct Facet boundaries", () => {
  const facets = [createModuleFacet(manifest), createGenerationModuleFacet(manifest)];

  assert.deepEqual(modulesFromFacets(facets), [{
    name: manifest.name,
    dependencies: [],
    types: ["Prompt", "Image"],
  }]);
  assert.deepEqual(generationModulesFromFacets(facets), [{
    module: { name: manifest.name },
    capabilities: manifest.capabilities,
    producers: manifest.producers,
  }]);
});
