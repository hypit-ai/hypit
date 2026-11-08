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
  const facet = createGenerationNodePackageFacet({ nodes: [{ kind: "operation", using, fragment }] });
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
  assert.equal(implementation.kind, "operation");
  if (implementation.kind !== "operation") return;
  assert.equal(implementation.fragment, fragment);
  assert.equal(implementation.executionPackage, "@example/image");
});

test("the Host refuses missing and duplicate component owners", async () => {
  const implementation = { nodes: [{ kind: "operation" as const, using, fragment }] };
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

test("a package-owned value node loads authored inputs through Host capabilities", async () => {
  const valueUsing = { module: moduleRef, name: "existing" } as const;
  const attachment = {
    blob: { kind: "blob" as const, resource: "res_existing" as const, size: 1, mediaType: "image/png" },
    open: async () => (async function* () { yield new Uint8Array([1]); })(),
  };
  const host = createGenerationGraphLoweringHost([{
    specifier: "@example/image",
    implementation: { nodes: [{
      kind: "value",
      using: valueUsing,
      inputs: ["asset"],
      type,
      load: ({ inputs }) => inputs.asset!,
    }] },
  }], {
    resolveAsset: () => attachment.blob,
    readAsset: () => new Uint8Array(),
    attachments: () => [attachment],
  });
  const implementation = await host.resolveImplementation({
    id: "existing",
    using: valueUsing,
    inputs: { asset: { value: "./still.png" } },
  }, {
    format: "hypit.generation-graph@1",
    id: "images",
    name: "Images",
    revision: 0,
    nodes: [],
    layout: [],
  });
  assert.deepEqual(implementation, {
    kind: "value",
    using: valueUsing,
    type,
    value: "./still.png",
  });
  assert.deepEqual(await host.attachments?.(), [attachment]);
});
