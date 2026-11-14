import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealGraphFragment } from "@hypit/generation-authoring/author";
import { runCliApplication } from "@hypit/cli";
import {
  applyGenerationGraphTransaction,
  createGenerationGraphProject,
  createGenerationNodePackageFacet,
} from "@hypit/generation-graph";
import {
  readGenerationGraphProjectFile,
  writeGenerationGraphProjectFile,
} from "@hypit/generation-graph/node";
import type { LoadedPackage } from "@hypit/loader";
import type { GenerationModuleDefinition } from "@hypit/generation-build";

import {
  createGenerationGraphCliCommandModules,
  type GenerationGraphCliServices,
} from "../src/index.js";

const moduleRef = { name: "@example/image" } as const;
const imageType = { module: moduleRef, name: "Image" } as const;
const using = { module: moduleRef, name: "generate" } as const;
const producer = { module: moduleRef, name: "generate" } as const;
const manifest: GenerationModuleDefinition = {
  name: moduleRef.name,
  dependencies: [],
  types: [imageType.name],
  capabilities: [],
  producers: [{ name: producer.name, inputs: [], result: { kind: "output", name: "image", type: imageType } }],
};
const fragment = sealGraphFragment({
  inputs: [],
  operations: [{
    id: "generate",
    producer,
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
      {
        kind: "hypit.producer-package",
        implementation: [{ producer, handler: () => ({ kind: "output", value: "finished image" }) }],
      },
    ],
  },
};

function runtimeHost(
  calls: string[],
): Awaited<ReturnType<GenerationGraphCliServices["openRuntimeHost"]>> {
  return {
    async openInspection() {
      calls.push("inspection.open");
      return {
        endpoints: async () => [],
        preflight: async () => ({ diagnostics: [] }),
        ensureExecution: async () => ({ state: "running" }),
        createRuntime: async () => ({
          async build(input) {
            calls.push("build");
            return {
              id: input.id,
              state: {} as never,
              view: {
                id: input.id,
                activity: "ready" as const,
                targets: [...input.authoring.targets],
                operations: [],
              },
            };
          },
          async close() { calls.push("runtime.close"); },
        }),
        async close() { calls.push("inspection.close"); },
      };
    },
  };
}

test("generation run submits a fresh Build every time without rewriting the recipe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-command-"));
  try {
    const graphPath = join(directory, "images.graph.json");
    const project = applyGenerationGraphTransaction(
      createGenerationGraphProject({ id: "images", name: "Images" }),
      { revision: 0, commands: [{
        kind: "node.add",
        node: { id: "hero", using, inputs: {} },
      }] },
    );
    await writeGenerationGraphProjectFile(graphPath, project);

    const products = {
      async readProduct() { return undefined; },
      async resolveProduct() { return undefined; },
    };
    const calls: string[] = [];
    let runtimeOpens = 0;
    const services: GenerationGraphCliServices = {
      packageRoot: directory,
      resolveProjectRuntime: async () => ({ profile: join(directory, "hypit.generation-runtime.json") }),
      async loadPackages(request) {
        assert.deepEqual(request.logical, [{ kind: "hypit.module", name: "@example/image" }]);
        return [loaded];
      },
      async openRuntimeHost() {
        runtimeOpens += 1;
        return runtimeHost(calls);
      },
      async openProjectResults() {
        return {
          location: {
            root: directory,
            historyPath: ".hypit/generation/results",
            productsPath: ".hypit/generation/products",
          },
          history: {
            read: async () => undefined,
            browse: async () => ({ results: [] }),
            openExecutionLog: async () => undefined,
          },
          products,
          close() { calls.push("results.close"); },
        };
      },
    };
    const run = async (): Promise<{
      readonly mode: string;
      readonly build?: string;
      readonly revision: number;
      readonly outputs?: readonly [{
        readonly node: string;
        readonly product: { readonly publication: string; readonly name: string };
      }];
    }> => {
      let output = "";
      await runCliApplication(
        ["generation", "run", graphPath, "--target", "hero", "--json"],
        { write(text) { output += text; } },
        {
          cwd: directory,
          resolveProjectRoot: async () => directory,
          commandModules: createGenerationGraphCliCommandModules(services),
        },
      );
      return JSON.parse(output) as {
        readonly mode: string;
        readonly build?: string;
        readonly revision: number;
        readonly outputs?: readonly [{
          readonly node: string;
          readonly product: { readonly publication: string; readonly name: string };
        }];
      };
    };

    let checkOutput = "";
    await runCliApplication(
      ["generation", "check", graphPath, "--json"],
      { write(text) { checkOutput += text; } },
      {
        cwd: directory,
        resolveProjectRoot: async () => directory,
        commandModules: createGenerationGraphCliCommandModules(services),
      },
    );
    const checked = JSON.parse(checkOutput) as { valid: boolean; ready: boolean; nodes: readonly { readiness: string }[] };
    assert.equal(checked.valid, true);
    assert.equal(checked.ready, true);
    assert.deepEqual(checked.nodes.map((node) => node.readiness), ["ready"]);
    assert.equal(runtimeOpens, 0);

    let planOutput = "";
    await runCliApplication(
      ["generation", "plan", graphPath, "--target", "hero", "--json"],
      { write(text) { planOutput += text; } },
      {
        cwd: directory,
        resolveProjectRoot: async () => directory,
        commandModules: createGenerationGraphCliCommandModules(services),
      },
    );
    const planned = JSON.parse(planOutput) as { ok: boolean; targets: readonly string[]; preflight: { ok: boolean } };
    assert.equal(planned.ok, true);
    assert.deepEqual(planned.targets, ["hero"]);
    assert.equal(planned.preflight.ok, true);
    assert.equal(runtimeOpens, 1);
    assert.equal(calls.filter((call) => call === "build").length, 0);

    const first = await run();
    assert.equal(first.mode, "build");
    assert.equal(typeof first.build, "string");
    assert.equal(first.revision, 1);
    assert.deepEqual(first.outputs, [{
      node: "hero",
      product: { publication: first.build, name: "hero" },
    }]);
    assert.equal(runtimeOpens, 2);
    assert.equal(calls.filter((call) => call === "build").length, 1);
    assert.deepEqual(await readGenerationGraphProjectFile(graphPath), project);

    const second = await run();
    assert.equal(second.mode, "build");
    assert.equal(second.revision, 1);
    assert.deepEqual(second.outputs, [{
      node: "hero",
      product: { publication: second.build, name: "hero" },
    }]);
    assert.notEqual(second.build, first.build);
    assert.equal(runtimeOpens, 3);
    assert.equal(calls.filter((call) => call === "build").length, 2);
    assert.deepEqual(await readGenerationGraphProjectFile(graphPath), project);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generation materialize hands one exact Product to the application media seam", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-generation-materialize-"));
  try {
    const canonicalDirectory = await realpath(directory);
    const calls: string[] = [];
    const products = {
      async readProduct() { return undefined; },
      async resolveProduct() { return undefined; },
    };
    const services: GenerationGraphCliServices = {
      packageRoot: directory,
      async loadPackages() { throw new Error("materialization does not load graph packages"); },
      async openRuntimeHost() { throw new Error("materialization does not open Runtime"); },
      async openProjectResults() {
        calls.push("results.open");
        return {
          location: { root: directory, historyPath: ".hypit/generation/results", productsPath: ".hypit/generation/products" },
          history: {
            read: async () => undefined,
            browse: async () => ({ results: [] }),
            openExecutionLog: async () => undefined,
          },
          products,
          close() { calls.push("results.close"); },
        };
      },
      async materializeMediaProduct(request, openedProducts) {
        calls.push("materialize");
        assert.equal(openedProducts, products);
        assert.deepEqual(request, {
          product: { publication: "bld_exact", name: "hero" },
          assetPath: join(canonicalDirectory, "assets/hero.media.json"),
        });
        return {
          assetPath: request.assetPath,
          mediaPath: join(canonicalDirectory, "assets/hero.mp4"),
        };
      },
    };
    let output = "";
    await runCliApplication(
      ["generation", "materialize", "bld_exact", "--output", "hero", "--to", "assets/hero.media.json", "--json"],
      { write(text) { output += text; } },
      {
        cwd: directory,
        resolveProjectRoot: async () => directory,
        commandModules: createGenerationGraphCliCommandModules(services),
      },
    );
    assert.deepEqual(JSON.parse(output), {
      format: "hypit.generation-media-materialization@1",
      ok: true,
      product: { publication: "bld_exact", name: "hero" },
      asset: join(canonicalDirectory, "assets/hero.media.json"),
      media: join(canonicalDirectory, "assets/hero.mp4"),
    });
    assert.deepEqual(calls, ["results.open", "materialize", "results.close"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
