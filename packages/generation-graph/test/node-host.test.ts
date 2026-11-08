import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";
import type { LoadedPackage } from "@hypit/loader";
import type { ProductHistory } from "@hypit/product";
import type { ModuleManifest } from "@hypit/protocol";

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

const moduleRef = { name: "@example/image", version: "1" } as const;
const imageType = { module: moduleRef, name: "Image" } as const;
const using = { module: moduleRef, name: "generate" } as const;
const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
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
    format: "hypit.package@1",
    modules: [{ manifest }],
    facets: [createGenerationNodePackageFacet({ nodes: [{ using, fragment }] })],
  },
};

test("the Node Host submits real work once, attaches its Product, then reuses it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-host-"));
  try {
    const projectPath = join(directory, "images.graph.json");
    const project = applyGenerationGraphTransaction(
      createGenerationGraphProject({ id: "images", name: "Images" }),
      { revision: 0, commands: [{ kind: "node.add", node: {
        id: "hero", using, inputs: {}, products: [], selected: "generate",
      } }] },
    );
    await writeGenerationGraphProjectFile(projectPath, project);

    let ready = false;
    const products: ProductHistory = {
      async readProduct() { return undefined; },
      async resolveProduct(address) {
        if (!ready) return undefined;
        return {
          address,
          type: imageType,
          publisher: "hypit.product@1",
          value: "finished image",
          async openResource() { return undefined; },
        };
      },
    };
    const host = createNodeGenerationGraphProjectHost({
      projectPath,
      packages: [loaded],
      products,
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
    const attached = await readGenerationGraphProjectFile(projectPath);
    assert.equal(attached.nodes[0]?.selected,
      `./products/hero/${build}.json`);

    ready = true;
    const second = await executeNodeGenerationGraphTargets({
      projectPath,
      host,
      targets: ["hero"],
      runtime,
      publicationStores: { root: directory, historyPath: "results", productsPath: "products" },
    });
    assert.equal(second.kind, "reuse");
    assert.equal(requests.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
