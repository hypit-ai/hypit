import { fileExecutionLogs } from "../../src/log.js";
import { readExecutionLog } from "@hypit/generation-runtime";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { FileResourceStore } from "@hypit/resource-store/node";
import { FileBuildResultHistory } from "@hypit/result/node";
import { EnvironmentCredentialStore } from "./environment-credential-store.js";
import { defineEndpoint } from "@hypit/endpoint";
import type { AsyncEndpoint, EndpointInstance } from "@hypit/endpoint";
import { createProducerPackageFacet } from "@hypit/producer";
import type { ProducerPackage } from "@hypit/producer";
import { createRefinementPackageFacet } from "@hypit/refinement";
import type { RefinementPackage } from "@hypit/refinement";
import { createLocalRuntime } from "@hypit/generation-runtime-local";
import { resolveProjectRoot } from "@hypit/project/node";
import { NodeFilesystemWorkspace } from "@hypit/generation-authoring/workspace/node";
import { defineBuild, link } from "@hypit/generation-build";
import { loadNodePackageSelection } from "@hypit/loader/node";
import { credentialRef } from "@hypit/execution-environment";
import { buildExecutionActivity } from "@hypit/generation-runtime-local";
import type { BuildCompletion } from "@hypit/generation-runtime-local";
import type { CredentialValue, WritableCredentialStore } from "@hypit/execution-environment";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";

import {
  capabilities,
  createGreetingBuild,
  createGreetingBuildFixture,
  createParallelGreetingBuild,
  manifest as greetingManifest,
  producers,
  types,
} from "../execution-scenario.js";

import {
  definition,
  durableBuildRequest,
  finishClaimedBuild,
  projectRuntimeFixture,
  publicationStoreLocation,
  runFixture,
} from "./local-scenario.js";

test("project local runtime accepts components loaded from an installed package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-components-"));
  const runtimeRoot = join(directory, "external-project");
  const installedRoot = join(directory, "hypit-install");
  const packageRoot = join(installedRoot, "node_modules", "example-greeting-components");
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({
    name: "example-greeting-components",
    version: "1.0.0",
    type: "module",
    exports: "./activation.mjs",
    hypit: { activation: "./activation.mjs" },
  }), "utf8");
  await writeFile(join(packageRoot, "activation.mjs"), `
    const manifest = ${JSON.stringify(greetingManifest)};
    const module = { name: manifest.name };
    const producer = (name) => ({ module, name });
    export default {
      facets: [{
        kind: "hypit.module",
        address: manifest.name,
        implementation: manifest,
      }, {
        kind: "hypit.producer-package",
        implementation: [
          {
            producer: producer("make-prompt"),
            handler({ inputs }) {
              const intent = inputs.intent.value;
              return { kind: "output", value: "Greet " + intent.name };
            },
          },
          {
            producer: producer("placeholder-text"),
            handler() {
              return { kind: "output", value: "Preview greeting" };
            },
          },
          {
            producer: producer("assemble"),
            handler({ inputs }) {
              return { kind: "output", value: { text: inputs.generated.value } };
            },
          },
        ],
      }],
    };
  `, "utf8");

  try {
    const runtime = await createLocalRuntime({
      ...projectRuntimeFixture(runtimeRoot),
      loadProducerPackages: async (specifiers) => {
        return await loadNodePackageSelection(specifiers, installedRoot);
      },
    });
    const selected = createGreetingBuildFixture({ generationStep: "placeholder" });
    const result = await runtime.build({
      ...durableBuildRequest(runtimeRoot, "bld_20260902T120000012Z_0000000001", selected),
      executionPackages: ["example-greeting-components"],
    });
    assert("view" in result);
    assert.equal(result.view.activity, "ready");
    const completed = await finishClaimedBuild(runtime);
    assert.equal(completed.outcome, "complete");
    assert.equal((await new FileBuildResultHistory(join(runtimeRoot, "results"))
      .read("bld_20260902T120000012Z_0000000001"))?.outcome, "complete");
    await runtime.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("project local runtime remembers the complete package closure across incremental Builds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-local-component-closure-"));
  const loadedSelections: string[][] = [];
  const sharedComponents: { producers: ProducerPackage; refinements?: RefinementPackage } = {
    refinements: [{ type: types.intent, handler() {} }],
    producers: [
      {
        producer: producers.makePrompt,
        handler({ inputs }) {
          const intent = inputs.intent?.value;
          const name = (intent as { readonly name: string }).name;
          return { kind: "output", value: (`Greet ${name}`) };
        },
      },
      {
        producer: producers.placeholderText,
        handler() {
          return { kind: "output", value: ("Preview greeting") };
        },
      },
      {
        producer: producers.assemble,
        handler({ inputs }) {
          const generated = inputs.generated!.value;
          return { kind: "output", value: ({ text: generated }) };
        },
      },
    ],
  };
  const runtime = await createLocalRuntime({
    ...projectRuntimeFixture(directory),
    loadProducerPackages(specifiers) {
      loadedSelections.push([...specifiers]);
      return [
        ...specifiers.map((specifier) => ({ specifier, contribution: { } })),
        { specifier: "example-shared-components", contribution: {
          facets: [createProducerPackageFacet(sharedComponents.producers), createRefinementPackageFacet(sharedComponents.refinements ?? [])],
        } },
      ];
    },
  });
  try {
    for (const [id, specifier] of [
      ["bld_20260902T120000013Z_0000000001", "example-feature-a"],
      ["bld_20260902T120000014Z_0000000001", "example-feature-b"],
      ["bld_20260902T120000015Z_0000000001", "example-shared-components"],
    ] as const) {
      const initial = createGreetingBuildFixture({ generationStep: "placeholder" });
      await runtime.build({
        ...durableBuildRequest(directory, id, initial),
        executionPackages: [specifier],
      });
      const completed = await finishClaimedBuild(runtime);
      assert.equal(completed.outcome, "complete");
    }
    assert.deepEqual(loadedSelections, [
      ["example-feature-a"],
      ["example-feature-b"],
    ]);
  } finally {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});
