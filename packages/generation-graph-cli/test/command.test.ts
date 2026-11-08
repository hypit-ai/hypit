import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealGraphFragment } from "@hypit/author";
import type { CliRuntimeHost } from "@hypit/build-cli";
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
import type { ModuleManifest } from "@hypit/protocol";

import {
  createGenerationGraphCliCommandModules,
  type GenerationGraphCliServices,
} from "../src/index.js";

const moduleRef = { name: "@example/image", version: "1" } as const;
const imageType = { module: moduleRef, name: "Image" } as const;
const using = { module: moduleRef, name: "generate" } as const;
const producer = { module: moduleRef, name: "generate" } as const;
const manifest: ModuleManifest = {
  format: "hypit.module@1",
  name: moduleRef.name,
  version: moduleRef.version,
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
    format: "hypit.package@1",
    modules: [{ manifest }],
    facets: [
      createGenerationNodePackageFacet({ nodes: [{ using, fragment }] }),
      {
        abi: "hypit.producer-package@1",
        implementation: [{ producer, handler: () => ({ kind: "output", value: "finished image" }) }],
      },
    ],
  },
};

function runtimeHost(profile: string, calls: string[]): CliRuntimeHost {
  return {
    profile,
    executionStatus: async () => ({ state: "running" }),
    ensureExecution: async () => ({ state: "running" }),
    createRuntime: async () => { throw new Error("command submission must use one inspection"); },
    openControl: async () => { throw new Error("unused"); },
    openCredentials: async () => { throw new Error("unused"); },
    preflight: async () => ({ dataRoot: "/runtime", diagnostics: [] }),
    doctor: async () => ({ dataRoot: "/runtime", diagnostics: [] }),
    endpoints: async () => [],
    pricing: async () => [],
    invoke: async () => { throw new Error("unused"); },
    openTransientExecution: async () => { throw new Error("unused"); },
    async openInspection() {
      calls.push("inspection.open");
      return {
        dataRoot: "/runtime",
        endpoints: async () => [],
        pricing: async () => [],
        preflight: async () => ({ dataRoot: "/runtime", diagnostics: [] }),
        executionStatus: async () => ({ state: "running" }),
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
          inspect: async () => undefined,
          activity: async () => ({ builds: [], capacity: [] }),
          cancel: async () => undefined,
          describeCredentials: async () => [],
          credentials: async () => [],
          putCredential: async () => { throw new Error("unused"); },
          deleteCredential: async () => { throw new Error("unused"); },
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
      resolveProjectRuntime: async () => ({ profile: join(directory, "hypit.runtime.json") }),
      async loadPackages(request) {
        assert.deepEqual(request.logical, [{ abi: "hypit.module@1", name: "@example/image@1" }]);
        return [loaded];
      },
      async openRuntimeHost(profile) {
        runtimeOpens += 1;
        return runtimeHost(profile, calls);
      },
      async openProjectResults() {
        return {
          location: {
            root: directory,
            historyPath: ".hypit/results",
            productsPath: ".hypit/products",
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

    const first = await run();
    assert.equal(first.mode, "build");
    assert.equal(typeof first.build, "string");
    assert.equal(first.revision, 1);
    assert.deepEqual(first.outputs, [{
      node: "hero",
      product: { publication: first.build, name: "hero" },
    }]);
    assert.equal(runtimeOpens, 1);
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
    assert.equal(runtimeOpens, 2);
    assert.equal(calls.filter((call) => call === "build").length, 2);
    assert.deepEqual(await readGenerationGraphProjectFile(graphPath), project);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
