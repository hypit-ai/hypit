import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ExecutionEnvironmentAdapterRegistry } from "@hypit/execution-environment-local/extension";
import { FileBuildFinalizationStore } from "../../src/result-storage/index.js";
import { FileBuildResultHistory } from "@hypit/result/node";
import { FileProductHistory } from "@hypit/product/node";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";
import {
  createRuntimeControlFromConfig,
  doctorProjectPublicationStores,
  openProjectPublicationStores,
} from "../../src/config.js";
import { createLocalRuntimeControl } from "@hypit/generation-runtime-local";

import { writeProfilePair } from "./config-scenario.js";

test("Build Results belong to the project filesystem without a second selection plane", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-results-"));
  const project = join(root, "project");
  await mkdir(project, { recursive: true });
  try {
    const local = await openProjectPublicationStores(project);
    assert.ok(local.finalization instanceof FileBuildFinalizationStore);
    assert.ok(local.history instanceof FileBuildResultHistory);
    assert.notEqual(local.history, local.finalization);
    assert.ok(local.products instanceof FileProductHistory);
    assert.notEqual(local.products, local.finalization);
    assert.deepEqual(local.location, {
      root: project,
      historyPath: ".hypit/generation/results",
      productsPath: ".hypit/generation/products",
    });
    const diagnosed = await doctorProjectPublicationStores(project);
    assert.deepEqual(diagnosed.diagnostics, []);
    assert.deepEqual(diagnosed.location, local.location);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication diagnosis checks Product storage independently from Build history", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-publications-"));
  const project = join(root, "project");
  await mkdir(join(project, ".hypit", "generation"), { recursive: true });
  await writeFile(join(project, ".hypit", "generation", "products"), "not a directory");
  try {
    const diagnosed = await doctorProjectPublicationStores(project);
    assert.deepEqual(diagnosed.diagnostics, [{
      severity: "error",
      code: "PRODUCT_DIRECTORY_UNAVAILABLE",
      message: `${join(project, ".hypit", "generation", "products")} is not a directory`,
      subject: join(project, ".hypit", "generation", "products"),
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active Build inspection requires no selected ResourceStore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-slice-"));
  const path = join(root, "hypit.generation-runtime.json");
  await writeProfilePair(path, { dataRoot: "." });
  const state = new SqliteRuntimeState(join(root, "runtime.sqlite"));
  state.close();
  const registry = new ExecutionEnvironmentAdapterRegistry();
  try {
    const control = await createRuntimeControlFromConfig(path, { registry, readOnly: true });
    assert.equal(await control.inspect("missing"), undefined);
    await control.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active Build inspection exposes only Product summaries already materialized in its draft", async () => {
  const build = "bld_20261108T100000000Z_0000000001";
  const location = { root: "/project", historyPath: "results", productsPath: "products" };
  const output = {
    address: { publication: build, name: "base" },
    type: { module: { name: "@example/image" }, name: "Image" },
    publisher: "hypit.product@1",
    representation: "inline" as const,
    value: "ready",
  };
  const control = createLocalRuntimeControl({
    buildStore: { read: async () => undefined } as never,
    commandExecutionStore: { list: async () => [] } as never,
    operationStore: { list: async () => [] } as never,
    submissionStore: { read: async () => undefined, list: async () => [] } as never,
    executionStore: {
      read: async () => ({
        build,
        executionPackages: [],
        publicationStores: location,
        createdAt: 0,
      }),
      list: async () => [],
      listCapacity: async () => [],
    } as never,
    openPublicationStores: async () => ({
      history: {} as never,
      products: {} as never,
      finalization: {
        readStored: async () => ({
          format: "hypit.build-result@1",
          id: build,
          sourcePath: "images.graph.json",
          targets: ["final"],
          outputs: { base: output },
        }),
      } as never,
    }),
  });
  const view = await control.inspect(build);
  assert.deepEqual(view?.outputs, { base: output });
});
