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
import { readRuntimeWorkerOptions } from "../../src/config.js";

import {
  greetingProducers,
  profile,
  endpointDemand,
  endpointQuery,
} from "./config-scenario.js";

test("Local Runtime Profile names credentials and Endpoints, not project result storage", () => {
  const parsed = parseLocalRuntimeProfile(profile({
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { generation: { use: "example.provider", pool: "shared" } },
  }));
  assert.equal(parsed.dataRoot, ".hypit/runtimes/local");
  assert.deepEqual(parsed.credentials, [{ use: "example.credentials", instance: "secrets" }]);
  assert.deepEqual(parsed.endpoints, [{ use: "example.provider", instance: "generation", pool: "shared" }]);
});

test("execution memory policy belongs to the local Worker, with an explicit MiB budget", () => {
  assert.deepEqual(parseLocalRuntimeProfile({ ...profile(), worker: { executionMemoryMb: 768 } }).worker,
    { executionMemoryMb: 768 });
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), worker: { executionMemoryMb: 0 } }), /positive integer/u);
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), worker: { executionMemoryMb: 768, maxBuilds: 8 } }), /maxBuilds/u);
});


test("Local Runtime Profile rejects source ownership fields", () => {
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), root: "." }), /does not accept root/u);
});

test("Runtime Profile JSON diagnostics name the selected file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hypit-profile-json-"));
  const path = join(directory, "broken.runtime.json");
  try {
    await writeFile(path, "{ broken");
    await assert.rejects(readRuntimeWorkerOptions(path), new RegExp(`Runtime Profile ${path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} is not valid JSON`, "u"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
