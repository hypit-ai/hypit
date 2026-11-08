import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";
import { defineEndpoint } from "@hypit/endpoint";
import {
  applyGenerationGraphTransaction,
  createGenerationGraphProject,
  createGenerationNodePackageFacet,
} from "@hypit/generation-graph";
import {
  createNodeGenerationGraphProjectHost,
  executeNodeGenerationGraphTargets,
  writeGenerationGraphProjectFile,
} from "@hypit/generation-graph/node";
import type { LoadedPackage } from "@hypit/loader";
import { FileProductHistory } from "@hypit/product/node";
import { createProducerPackageFacet } from "@hypit/producer";
import type { ModuleManifest } from "@hypit/protocol";
import { FileBuildResultHistory } from "@hypit/result/node";
import { createLocalRuntime } from "@hypit/runtime-local";

import {
  finishClaimedBuild,
  projectRuntimeFixture,
  publicationStoreLocation,
} from "./local-scenario.js";

const moduleRef = { name: "example.generation-graph", version: "1" } as const;
const types = {
  prompt: { module: moduleRef, name: "Prompt" },
  artifact: { module: moduleRef, name: "Artifact" },
} as const;
const capability = { module: moduleRef, name: "generate-artifact" } as const;
const producers = {
  prepare: { module: moduleRef, name: "prepare" },
  request: { module: moduleRef, name: "request" },
} as const;
const components = {
  local: { module: moduleRef, name: "local-artifact" },
  remote: { module: moduleRef, name: "remote-artifact" },
} as const;

const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
  dependencies: [],
  types: Object.values(types).map((type) => type.name),
  capabilities: [{ name: capability.name, returns: types.artifact }],
  producers: [{
    name: producers.prepare.name,
    inputs: [{ name: "prompt", type: types.prompt }],
    result: { kind: "output", name: "artifact", type: types.artifact },
  }, {
    name: producers.request.name,
    inputs: [{ name: "source", type: types.artifact }],
    result: { kind: "need", name: "generation", capability },
  }],
};

const localFragment = sealGraphFragment({
  inputs: [{ name: "prompt", type: types.prompt }],
  operations: [{
    id: "prepare",
    producer: producers.prepare,
    inputs: { prompt: { kind: "fragment-input", name: "prompt" } },
    result: { kind: "output", name: "artifact" },
  }],
  exports: [{
    name: "result",
    type: types.artifact,
    root: { kind: "fragment-operation", operation: "prepare" },
  }],
});

const remoteFragment = sealGraphFragment({
  inputs: [{ name: "source", type: types.artifact }],
  operations: [{
    id: "request",
    producer: producers.request,
    inputs: { source: { kind: "fragment-input", name: "source" } },
    result: { kind: "need", name: "generation" },
  }],
  exports: [{
    name: "result",
    type: types.artifact,
    root: { kind: "fragment-operation", operation: "request" },
  }],
});

const loadedPackage: LoadedPackage = {
  specifier: "example-generation-components",
  contribution: {
    format: "hypit.package@1",
    modules: [{ manifest }],
    facets: [
      createGenerationNodePackageFacet({ nodes: [
        { using: components.local, fragment: localFragment },
        { using: components.remote, fragment: remoteFragment },
      ] }),
      createProducerPackageFacet([{
        producer: producers.prepare,
        handler: () => ({ kind: "output", value: "prepared source" }),
      }, {
        producer: producers.request,
        handler: ({ inputs }) => ({
          kind: "need",
          constraints: { source: inputs.source!.value },
        }),
      }]),
    ],
  },
};

test("a Generation Graph preserves completed upstream Products across asynchronous failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-graph-runtime-"));
  const projectPath = join(directory, "generation.graph.json");
  const build = "bld_20261108T120000000Z_0000000001";
  const endpoint = defineEndpoint({
    instance: "generation.failure",
    pool: "generation.failure",
    capabilities: [{
      lifecycle: "asynchronous",
      capability,
      returns: types.artifact,
      endpoint: {
        start: () => ({
          status: "failed",
          failure: { code: "REMOTE_FAILED", message: "remote generation failed" },
        }),
        poll: () => { throw new Error("failed work is not polled"); },
      },
    }],
  });
  const runtimeFixture = projectRuntimeFixture(directory);
  let runtime: Awaited<ReturnType<typeof createLocalRuntime>> | undefined;
  try {
    const project = applyGenerationGraphTransaction(
      createGenerationGraphProject({ id: "generation", name: "Generation" }),
      { revision: 0, commands: [{
        kind: "node.add",
        node: {
          id: "base",
          using: components.local,
          inputs: { prompt: { value: "make a source" } },
          products: [],
          selected: "generate",
        },
      }, {
        kind: "node.add",
        node: {
          id: "final",
          using: components.remote,
          inputs: { source: { node: "base" } },
          products: [],
          selected: "generate",
        },
      }] },
    );
    await writeGenerationGraphProjectFile(projectPath, project);

    const products = new FileProductHistory(join(directory, ".hypit", "products"));
    const host = createNodeGenerationGraphProjectHost({
      projectPath,
      packages: [loadedPackage],
      products,
    });
    const loadedSelections: string[][] = [];
    runtime = await createLocalRuntime({
      ...runtimeFixture,
      endpoints: [endpoint],
      loadProducerPackages(specifiers) {
        loadedSelections.push([...specifiers]);
        return [loadedPackage];
      },
    });

    const submitted = await executeNodeGenerationGraphTargets({
      projectPath,
      host,
      targets: ["final"],
      runtime,
      publicationStores: publicationStoreLocation(directory),
      build,
    });
    assert.equal(submitted.kind, "build");
    assert.equal((await finishClaimedBuild(runtime)).outcome, "failed");
    assert.deepEqual(loadedSelections, [[loadedPackage.specifier]]);

    const result = await new FileBuildResultHistory(join(directory, "results")).read(build);
    assert.equal(result?.outcome, "failed");
    assert.deepEqual(Object.keys(result?.outputs ?? {}), ["base"]);
    const base = result?.outputs.base;
    assert.equal(base?.representation, "inline");
    assert.equal(base?.representation === "inline" ? base.value : undefined, "prepared source");

    const reused = await executeNodeGenerationGraphTargets({
      projectPath,
      host,
      targets: ["base"],
      runtime,
      publicationStores: publicationStoreLocation(directory),
    });
    assert.equal(reused.kind, "reuse");
  } finally {
    if (runtime === undefined) runtimeFixture.close();
    else await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});
