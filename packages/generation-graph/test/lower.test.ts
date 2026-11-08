import assert from "node:assert/strict";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";
import { createResolvedClosure, link, planBuild } from "@hypit/kernel";
import type { ModuleManifest, TypeRef } from "@hypit/protocol";

import {
  lowerGenerationGraph,
  prepareGenerationGraphTargets,
  type GenerationGraphProject,
} from "../src/index.js";

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

function project(): GenerationGraphProject {
  return {
    format: "hypit.generation-graph@1",
    id: "images",
    name: "Images",
    revision: 0,
    nodes: [{
      id: "base",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { value: "prompt" } },
    }, {
      id: "final",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { node: "base" } },
    }, {
      id: "delivery",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { node: "final" } },
    }],
  };
}

const host = {
  resolveImplementation: () => ({
    kind: "operation" as const,
    using: { module: moduleRef, name: "transform" },
    fragment,
    executionPackage: "@example/generator",
  }),
};

test("lowering preserves the demanded Operation chain", async () => {
  const lowered = await lowerGenerationGraph(
    project(),
    link(createResolvedClosure([manifest]), []),
    host,
  );
  const planned = planBuild(lowered.program, lowered.graph, ["final"]);
  assert.equal(planned.plan.steps.length, 2);
  assert.deepEqual(lowered.graph.outputs.map((output) => output.id), ["base", "delivery", "final"]);
});

test("every submission publishes each demanded node output without mutating the recipe", async () => {
  const original = project();
  const prepared = await prepareGenerationGraphTargets(
    original,
    link(createResolvedClosure([manifest]), []),
    host,
    ["delivery"],
  );
  assert.equal(prepared.kind, "build");
  assert.equal(prepared.definition.plan.steps.length, 3);
  assert.deepEqual(prepared.generated.map((item) => item.node), ["base", "delivery", "final"]);
  assert.deepEqual(prepared.publication.outputs.map((item) => item.name), ["base", "delivery", "final"]);
  assert.deepEqual(prepared.executionPackages, ["@example/generator"]);
  assert.deepEqual(project(), original);
});

test("preparing a target ignores unrelated recipe branches", async () => {
  const base = project();
  const withOrphan: GenerationGraphProject = {
    ...base,
    nodes: [...base.nodes, {
      id: "orphan",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { value: "unused" } },
    }],
  };
  const prepared = await prepareGenerationGraphTargets(
    withOrphan,
    link(createResolvedClosure([manifest]), []),
    host,
    ["base"],
  );
  assert.deepEqual(prepared.generated.map((item) => item.node), ["base"]);
});

test("an authored value node closes over a Record without becoming Build work", async () => {
  const existing = { module: moduleRef, name: "existing" } as const;
  const valueProject: GenerationGraphProject = {
    format: "hypit.generation-graph@1",
    id: "existing-image",
    name: "Existing image",
    revision: 0,
    nodes: [{
      id: "source",
      using: existing,
      inputs: { asset: { value: "./still.png" } },
    }, {
      id: "final",
      using: { module: moduleRef, name: "transform" },
      inputs: { source: { node: "source" } },
    }],
  };
  const attachment = {
    blob: { kind: "blob" as const, resource: "res_existing" as const, size: 1, mediaType: "image/png" },
    open: async () => (async function* () { yield new Uint8Array([1]); })(),
  };
  const valueHost = {
    resolveImplementation: (node: GenerationGraphProject["nodes"][number]) => node.id === "source"
      ? {
          kind: "value" as const,
          using: existing,
          type: artifactType,
          value: "existing image",
        }
      : {
          kind: "operation" as const,
          using: { module: moduleRef, name: "transform" } as const,
          fragment,
          executionPackage: "@example/generator",
        },
    attachments: () => [attachment],
  };
  const prepared = await prepareGenerationGraphTargets(
    valueProject,
    link(createResolvedClosure([manifest]), []),
    valueHost,
    ["final"],
  );
  assert.equal(prepared.definition.plan.steps.length, 1);
  assert.deepEqual(prepared.generated.map((item) => item.node), ["final"]);
  assert.deepEqual(prepared.executionPackages, ["@example/generator"]);
  assert.deepEqual(prepared.attachments, [attachment]);
});
