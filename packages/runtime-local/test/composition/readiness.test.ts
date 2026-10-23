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

test("doctor reports a down Managed Program", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-program-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { speech: { use: "example.speech" } },
  })));
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.speech",
    activate: (context) => ({
      endpoint: {
        name: context.instance,
        instance: { id: context.instance, pool: context.pool ?? context.instance },
        capabilities: [],
        credentials: [],
      } as never,
      program: {
        id: "speech.local",
        probe: async () => ({ state: "down", detail: "not running" }),
      },
    }),
  }));
  try {
    const result = await doctorRuntimeConfig(path, { registry });
    assert.equal(result.diagnostics.some((item) => item.code === "MANAGED_PROGRAM_DOWN"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight validates credential stores without running their active doctor", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-preflight-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    credentials: { secrets: { use: "example.credentials" } },
  })));
  let activeChecks = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({ value: { async resolve() { return undefined; } } }),
    doctor: async () => {
      activeChecks += 1;
      return [];
    },
  }));
  try {
    const preflight = await preflightRuntimeConfig(path, { registry });
    assert.deepEqual(preflight.diagnostics, []);
    assert.equal(activeChecks, 0);
    await doctorRuntimeConfig(path, { registry });
    assert.equal(activeChecks, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight never runs an Endpoint's active doctor", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-endpoint-preflight-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { remote: { use: "example.remote" } },
  })));
  let activeChecks = 0;
  const capability = { module: { name: "example.remote", version: "1" }, name: "observe" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Observation" } as const;
  let diagnosedCapabilities: readonly string[] = [];
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.remote",
    activate: (context) => ({
      endpoint: {
        instance: { id: context.instance, pool: context.pool ?? context.instance },
        capabilities: [{ lifecycle: "immediate", capability, returns,
          handler: () => ({ value: null }), scheduling: { resources: [] } }],
        credentials: [],
      },
      diagnose: async ({ capabilities }) => {
        activeChecks += 1;
        diagnosedCapabilities = (capabilities ?? []).map((item) => item.name);
        return [];
      },
    }),
  }));
  try {
    await preflightRuntimeConfig(path, { registry });
    assert.equal(activeChecks, 0);
    await doctorRuntimeConfig(path, { registry });
    assert.equal(activeChecks, 1);
    assert.deepEqual(diagnosedCapabilities, ["observe"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("doctor reports inconsistent limits for shared pools and capacity resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-pools-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: {
      four: { use: "example.four", pool: "generation" },
      ten: { use: "example.ten", pool: "generation" },
    },
  })));
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  const registry = new RuntimeAdapterRegistry();
  for (const [use, name, concurrency] of [["example.four", "four", 4], ["example.ten", "ten", 10]] as const) {
    registry.registerFacet(createRuntimeEndpointAdapterFacet({
      use,
      activate: (context) => ({
        endpoint: defineEndpoint({
          instance: context.instance,
          pool: context.pool ?? context.instance,
          pricing: { kind: "local" },
          defaultConcurrency: concurrency,
          capabilities: [{
            capability: { module: { name: "example.model", version: "1" }, name },
            returns,
            lifecycle: "immediate",
            resources: [{ id: "capacity:generation/browsers", limit: concurrency }],
            handler: () => ({ value: (null) }),
          }],
        }),
      }),
    }));
  }
  try {
    const conflicts = (await preflightRuntimeConfig(path, { registry })).diagnostics.filter((item) => item.code === "RUNTIME_POOL_CONFLICT");
    for (const resource of ["pool:generation", "capacity:generation/browsers"]) {
      const conflict = conflicts.find((item) => item.subject === resource);
      assert.ok(conflict, `the shared resource ${resource} is reported`);
      assert.match(conflict.message, /4 concurrent/);
      assert.match(conflict.message, /10 concurrent/);
      assert.match(conflict.message, /same limit.*different pools/);
      assert.doesNotMatch(conflict.message, /defaultConcurrency/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("demanded readiness and Programs follow the chosen Endpoint, including before package loading", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-chosen-readiness-"));
  const path = join(root, "runtime.json");
  const capability = { module: { name: "example.speech", version: "1" }, name: "transcribe" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Text" } as const;
  let chosen = "local";
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.keys", validate() {},
    open: () => ({ value: { resolve: async () => chosen === "hosted" ? { secret: "fixture" } : undefined } }),
  }));
  for (const name of ["local", "hosted"]) registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: `example.${name}`,
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance, pool: context.instance, pricing: { kind: "local" },
        ...(name === "hosted" ? { credentials: { key: credentialRef("keys", "account") } } : {}),
        capabilities: [{ capability, returns, lifecycle: "immediate", handler: () => ({ value: ("ok") }) }],
      }),
      ...(name === "local" ? { program: { id: "local-service", probe: async () => chosen === "local"
        ? { state: "ready" as const } : { state: "down" as const, detail: "not selected" } } } : {}),
    }),
  }));
  try {
    const { declaredManagedPrograms } = await import("../../src/config.js");
    for (chosen of ["local", "hosted"]) {
      await writeFile(path, JSON.stringify(profile({ dataRoot: ".", credentials: { keys: { use: "example.keys" } },
        endpoints: { local: { use: "example.local" }, hosted: { use: "example.hosted" }, later: { use: "uninstalled.future.provider" } },
        bindings: { "example.speech@1#transcribe": chosen },
      })));
      assert.deepEqual((await preflightRuntimeConfig(path, { registry, capabilities: [capability] })).diagnostics, []);
      assert.deepEqual((await preflightRuntimeConfig(path, { registry, endpoints: [chosen] })).diagnostics, []);
      const programs = await declaredManagedPrograms(path, { registry, capabilities: [capability] });
      assert.deepEqual(programs.programs.map((item) => item.instance), chosen === "local" ? ["local"] : []);
    }
    assert.deepEqual((await preflightRuntimeConfig(path, { endpoints: [] })).diagnostics, []);
    await assert.rejects(preflightRuntimeConfig(path, { registry, endpoints: ["typo"] }), /no Endpoint typo/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
