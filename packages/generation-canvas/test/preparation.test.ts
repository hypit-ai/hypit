import assert from "node:assert/strict";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";
import { createResolvedClosure, link } from "@hypit/kernel";
import type { ProductHistory } from "@hypit/product";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";
import { createGenerationWorkspace, prepareGenerationWorkspaceNode } from "../src/index.js";
import type { GenerationGraphProject } from "@hypit/generation-graph";

const moduleRef = { name: "@example/generator", version: "1" } as const;
const artifactType = { module: moduleRef, name: "Artifact" } satisfies TypeRef;
const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: [artifactType.name],
  capabilities: [],
  producers: [{
    name: "transform",
    inputs: [{ name: "source", type: artifactType }],
    result: { kind: "output", name: "artifact", type: artifactType },
  }],
};
const fragment = sealGraphFragment({
  inputs: [{ name: "source", type: artifactType }],
  operations: [{
    id: "transform",
    producer: { module: moduleRef, name: "transform" },
    inputs: { source: { kind: "fragment-input", name: "source" } },
    result: { kind: "output", name: "artifact" },
  }],
  exports: [{
    name: "result",
    type: artifactType,
    root: { kind: "fragment-operation", operation: "transform" },
  }],
});
const graph: GenerationGraphProject = {
  format: "hypit.generation-graph@1",
  id: "images",
  name: "Images",
  revision: 0,
  nodes: [{
    id: "source",
    using: { module: moduleRef, name: "transform" },
    inputs: { source: { value: "prompt" } },
  }, {
    id: "middle",
    using: { module: moduleRef, name: "transform" },
    inputs: { source: { node: "source" } },
  }, {
    id: "final",
    using: { module: moduleRef, name: "transform" },
    inputs: { source: { node: "middle" } },
  }],
};
const workspace = {
  ...createGenerationWorkspace({ id: "images", name: "Images", graph: { path: "images.graph.json" } }),
  nodes: [
    { node: "source", name: "Source", x: 0, y: 0, selected: { build: "Build-A", output: "source" } },
    { node: "middle", name: "Middle", x: 400, y: 0 },
    { node: "final", name: "Final", x: 800, y: 0 },
  ],
  outputs: [{ node: "source", build: "Build-A", output: "source" }],
} as const;
const host = {
  resolveImplementation: () => ({
    kind: "operation" as const,
    using: { module: moduleRef, name: "transform" },
    fragment,
    executionPackage: "@example/generator",
  }),
};

test("Workspace selection cuts only its node while unselected dependencies continue executing", async () => {
  const blob = { kind: "blob" as const, resource: "res_source" as const, size: 1, mediaType: "image/png" };
  let lookups = 0;
  const products: ProductHistory = {
    async readProduct() { return undefined; },
    async resolveProduct(address) {
      lookups += 1;
      assert.deepEqual(address, { publication: "Build-A", name: "source" });
      return {
        address,
        type: artifactType,
        publisher: "hypit.product@1",
        value: blob,
        async openResource(candidate) {
          return candidate.resource === blob.resource
            ? (async function* () { yield new Uint8Array([1]); })()
            : undefined;
        },
      };
    },
  };
  const program = link(createResolvedClosure([manifest]), []);
  const selected = await prepareGenerationWorkspaceNode({
    graph, workspace, program, host, products, node: "final",
  });
  assert.equal(selected.definition.plan.steps.length, 2);
  assert.deepEqual(selected.generated.map((item) => item.node), ["final", "middle"]);
  assert.equal(selected.attachments.length, 1);
  assert.equal(lookups, 1);

  assert.equal(lookups, 1);
});

test("attached history without a selection does not stop recipe execution", async () => {
  const unselected = {
    ...workspace,
    nodes: workspace.nodes.map((node) => {
      if (node.node !== "source") return node;
      const { selected: _selected, ...rest } = node;
      return rest;
    }),
  };
  const products: ProductHistory = {
    async readProduct() { return undefined; },
    async resolveProduct() { throw new Error("unselected history must not be resolved"); },
  };
  const prepared = await prepareGenerationWorkspaceNode({
    graph,
    workspace: unselected,
    program: link(createResolvedClosure([manifest]), []),
    host,
    products,
    node: "final",
  });
  assert.equal(prepared.definition.plan.steps.length, 3);
  assert.deepEqual(prepared.generated.map((item) => item.node), ["final", "middle", "source"]);
});

test("an unavailable selected Product fails instead of silently regenerating its node", async () => {
  const products: ProductHistory = {
    async readProduct() { return undefined; },
    async resolveProduct() { return undefined; },
  };
  await assert.rejects(
    prepareGenerationWorkspaceNode({
      graph,
      workspace,
      program: link(createResolvedClosure([manifest]), []),
      host,
      products,
      node: "final",
    }),
    /Selected Product Build-A\/source for dependency source is unavailable/u,
  );
});
