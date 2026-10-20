import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRuntimeCredentialStoreAdapterFacet,
  createRuntimeEndpointAdapterFacet,
  RuntimeAdapterRegistry,
} from "@hypit/runtime-local/extension";
import { FileBuildResultRepository } from "@hypit/result/node";
import { MemoryResourceStore, ProducerRegistry } from "@hypit/executor";
import { defineEndpoint } from "@hypit/endpoint";
import { credentialRef } from "@hypit/runtime";
import type { CanonicalValue, CapabilityRef, TypeRef } from "@hypit/protocol";
import type { RuntimeHostEndpointQuery } from "@hypit/runtime-local";
import { SqliteRuntimeState } from "../../src/sqlite-state.js";
import { RefinementRegistry } from "@hypit/refinement";
import {
  capabilities as greetingCapabilities,
  createGreetingBuild,
  producers as greetingProducerRefs,
  types as greetingTypes,
} from "../execution-scenario.js";
import {
  createRuntimeControlFromConfig,
  createRuntimeFromConfig,
  createRuntimeResultControlFromConfig,
  describeRuntimeConfigEndpoints,
  doctorProjectBuildResultRepository,
  doctorRuntimeConfig,
  invokeRuntimeConfigNeed,
  openRuntimeConfigInspection,
  openTransientRuntimeConfigExecution,
  openProjectBuildResultRepository,
  parseLocalRuntimeProfile,
  preflightRuntimeConfig,
  readRuntimeConfigPricing,
} from "@hypit/runtime-local";

import {
  greetingProducers,
  profile,
  endpointDemand,
  endpointQuery,
} from "./config-scenario.js";

test("Build Results belong to the project filesystem without a second selection plane", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-results-"));
  const project = join(root, "project");
  await mkdir(project, { recursive: true });
  try {
    const local = await openProjectBuildResultRepository(project);
    assert.ok(local.repository instanceof FileBuildResultRepository);
    assert.deepEqual(local.location, { root: project, path: ".hypit/results" });
    const diagnosed = await doctorProjectBuildResultRepository(project);
    assert.deepEqual(diagnosed.diagnostics, []);
    assert.deepEqual(diagnosed.location, local.location);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("active Build inspection requires no selected ResourceStore", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-slice-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({ dataRoot: "." })));
  const state = new SqliteRuntimeState(join(root, "runtime.sqlite"));
  state.close();
  const registry = new RuntimeAdapterRegistry();
  try {
    const control = await createRuntimeControlFromConfig(path, { registry, readOnly: true });
    assert.equal(await control.inspect("missing"), undefined);
    await control.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Result control opens without loading the Runtime Profile's Endpoint adapters", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-result-control-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { unavailable: { use: "package.that.must.not.load" } },
  })));
  try {
    const resultControl = await createRuntimeResultControlFromConfig(path, {
      registry: new RuntimeAdapterRegistry(),
    });
    await resultControl.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
