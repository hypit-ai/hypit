import assert from "node:assert/strict";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";

import {
  assertGenerationNodeAuthoringShape,
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
  });
  assert.equal(implementation.kind, "operation");
  if (implementation.kind !== "operation") return;
  assert.equal(implementation.fragment, fragment);
  assert.equal(implementation.executionPackage, "@example/image");
});

test("an operation package compiles concise authored inputs without teaching Core its fields", async () => {
  const authoredUsing = { module: moduleRef, name: "authored-generate" } as const;
  const host = createGenerationGraphLoweringHost([{
    specifier: "@example/image",
    implementation: { nodes: [{
      kind: "operation",
      using: authoredUsing,
      output: type,
      resolve({ node }) {
        return node.inputs.prompt === undefined
          ? { kind: "incomplete", consumedInputs: [], missing: ["prompt"] }
          : {
              kind: "ready",
              consumedInputs: ["prompt"],
              compiled: { fragment, inputs: { source: node.inputs.prompt } },
            };
      },
    }] },
  }]);
  const implementation = await host.resolveImplementation({
    id: "hero",
    using: authoredUsing,
    inputs: { prompt: { value: "a lighthouse" } },
  }, {
    format: "hypit.generation-graph@1",
    id: "images",
    name: "Images",
    revision: 0,
    nodes: [],
  });
  assert.deepEqual(implementation, {
    kind: "operation",
    using: authoredUsing,
    fragment,
    inputs: { source: { value: "a lighthouse" } },
    executionPackage: "@example/image",
  });
});

test("the exact node owner exposes one data-only authoring shape to every host", () => {
  const authoredUsing = { module: moduleRef, name: "editable" } as const;
  const authoring = {
    using: authoredUsing,
    output: { type, connectable: true, media: ["image"] as const },
    controls: [{ id: "prompt", input: "prompt", value: { kind: "text" as const }, required: true }],
    ports: [{ id: "images", kind: "list" as const, entries: [{ role: "image" as const, prefix: "images" }],
      minItems: 0, maxItems: 4 }],
  };
  assertGenerationNodeAuthoringShape(authoring);
  const host = createGenerationGraphLoweringHost([{
    specifier: "@example/image",
    implementation: { nodes: [{ kind: "operation", using: authoredUsing, fragment, authoring }] },
  }]);
  assert.deepEqual(host.resolveAuthoring({ id: "hero", using: authoredUsing, inputs: {} }), authoring);
  assert.deepEqual(host.listAuthoring(), [authoring]);
  assert.throws(() => createGenerationGraphLoweringHost([{
    specifier: "@example/image",
    implementation: { nodes: [{ kind: "operation", using: authoredUsing, fragment, authoring: {
      ...authoring, output: { ...authoring.output, type: { module: moduleRef, name: "Video" } },
    } }] },
  }]), /authoring output differs/u);
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
    format: "hypit.generation-graph@1", id: "images", name: "Images", revision: 0, nodes: [],
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
  });
  assert.deepEqual(implementation, {
    kind: "value",
    using: valueUsing,
    type,
    value: "./still.png",
  });
  assert.deepEqual(await host.attachments?.(), [attachment]);
});
