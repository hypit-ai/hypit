import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealGraphFragment } from "@hypit/generation-authoring/author";
import type { LoadedPackage } from "@hypit/loader";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

import {
  createGenerationGraphProject,
  createGenerationNodePackageFacet,
  applyGenerationGraphTransaction,
} from "../src/index.js";
import {
  createNodeGenerationGraphProjectHost,
  executeNodeGenerationGraphTargets,
  readGenerationGraphProjectFile,
  writeGenerationGraphProjectFile,
  type GenerationGraphRuntimeRequest,
} from "../src/node/index.js";

const moduleRef = { name: "@example/image" } as const;
const imageType = { module: moduleRef, name: "Image" } as const;
const using = { module: moduleRef, name: "generate" } as const;
const manifest: GenerationModuleDefinition = {
  name: moduleRef.name,
  dependencies: [],
  types: [imageType.name],
  capabilities: [],
  producers: [{ name: "generate", inputs: [], result: { kind: "output", name: "image", type: imageType } }],
};
const fragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "generate",
    producer: { module: moduleRef, name: "generate" },
    inputs: {},
    result: { kind: "output", name: "image" },
  }],
  exports: [{ name: "result", type: imageType, root: { kind: "fragment-operation", operation: "generate" } }],
});
const loaded: LoadedPackage = {
  specifier: "@example/image",
  contribution: {
    facets: [
    createModuleFacet(manifest),
    createGenerationModuleFacet(manifest),
    createGenerationNodePackageFacet({ nodes: [{ kind: "operation", using, fragment }] }),
    ],
  },
};

test("the Node Host submits every invocation without rewriting the recipe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-host-"));
  try {
    const projectPath = join(directory, "images.graph.json");
    const project = applyGenerationGraphTransaction(
      createGenerationGraphProject({ id: "images", name: "Images" }),
      { revision: 0, commands: [{ kind: "node.add", node: {
        id: "hero", using, inputs: {},
      } }] },
    );
    await writeGenerationGraphProjectFile(projectPath, project);

    const host = createNodeGenerationGraphProjectHost({
      packages: [loaded],
    });
    const requests: GenerationGraphRuntimeRequest[] = [];
    const runtime = {
      async build(request: GenerationGraphRuntimeRequest) {
        requests.push(request);
        return { id: request.id };
      },
    };
    const build = "bld_20261108T110000000Z_0000000001";
    const first = await executeNodeGenerationGraphTargets({
      projectPath,
      host,
      targets: ["hero"],
      runtime,
      publicationStores: { root: directory, historyPath: "results", productsPath: "products" },
      build,
    });
    assert.equal(first.kind, "build");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]?.executionPackages, ["@example/image"]);
    assert.deepEqual(requests[0]?.authoring.publication.outputs.map((output) => output.name), ["hero"]);
    assert.deepEqual(await readGenerationGraphProjectFile(projectPath), project);

    const second = await executeNodeGenerationGraphTargets({
      projectPath,
      host,
      targets: ["hero"],
      runtime,
      publicationStores: { root: directory, historyPath: "results", productsPath: "products" },
      build: "bld_20261108T110000001Z_0000000001",
    });
    assert.equal(second.kind, "build");
    assert.equal(requests.length, 2);
    assert.deepEqual(await readGenerationGraphProjectFile(projectPath), project);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
