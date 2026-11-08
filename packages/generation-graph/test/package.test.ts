import assert from "node:assert/strict";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";

import {
  createGenerationGraphLoweringHost,
  createGenerationNodePackageFacet,
  generationNodePackagesFromFacets,
} from "../src/index.js";

const moduleRef = { name: "@example/image", version: "1" } as const;
const type = { module: moduleRef, name: "Image" } as const;
const using = { module: moduleRef, name: "generate" } as const;
const fragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "generate",
    producer: { module: moduleRef, name: "generate" },
    inputs: {},
    result: { kind: "output", name: "image" },
  }],
  exports: [{
    name: "result",
    type,
    root: { kind: "fragment-operation", operation: "generate" },
  }],
});

test("Generation Node behavior is contributed by an exact package Facet", async () => {
  const facet = createGenerationNodePackageFacet({ nodes: [{ using, fragment }] });
  const packages = generationNodePackagesFromFacets([facet]);
  const host = createGenerationGraphLoweringHost(
    [{ specifier: "@example/image", implementation: packages[0]! }],
  );
  const implementation = await host.resolveImplementation({
    id: "hero",
    using,
    inputs: {},
  }, {
    format: "hypit.generation-graph@1",
    id: "images",
    name: "Images",
    revision: 0,
    nodes: [],
    layout: [],
  });
  assert.equal(implementation.fragment, fragment);
  assert.equal(implementation.executionPackage, "@example/image");
});

test("the Host refuses missing and duplicate component owners", async () => {
  const implementation = { nodes: [{ using, fragment }] };
  assert.throws(() => createGenerationGraphLoweringHost([
    { specifier: "left", implementation },
    { specifier: "right", implementation },
  ]), /multiple implementations/u);

  const host = createGenerationGraphLoweringHost([]);
  await assert.rejects(async () => await host.resolveImplementation({
    id: "missing", using, inputs: {},
  }, {
    format: "hypit.generation-graph@1", id: "images", name: "Images", revision: 0, nodes: [], layout: [],
  }), /is not installed/u);
});
