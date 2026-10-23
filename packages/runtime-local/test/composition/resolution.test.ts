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

test("a Profile binds a contested capability to one of its Endpoints, and says so when it cannot", () => {
  const generateKey = "example.model@1#generate";
  assert.deepEqual(parseLocalRuntimeProfile(profile({
    endpoints: { paid: { use: "example.paid" }, local: { use: "example.local" } },
    bindings: { [generateKey]: "local" },
  })).bindings, { [generateKey]: "local" });
  assert.throws(() => parseLocalRuntimeProfile(profile({
    endpoints: { paid: { use: "example.paid" } },
    bindings: { [generateKey]: "nowhere" },
  })), /names nowhere, which is not an Endpoint instance of this Profile \(paid\)/u);
  assert.throws(() => parseLocalRuntimeProfile(profile({ bindings: { "not a key": "paid" } })), /capability key/u);
  assert.throws(() => parseLocalRuntimeProfile({ ...profile(), stale: 1, older: 2 }), /does not accept stale, older; it accepts/u);
});

test("Endpoint inspection, doctor and invoke share one resolver: a contested capability is ambiguous until the Profile binds it", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-bindings-"));
  const generate = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const render = { module: { name: "example.render", version: "1" }, name: "render" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  const generateKey = "example.model@1#generate";
  const registry = new RuntimeAdapterRegistry();
  for (const [use, instanceLabel, capability, answer] of [
    ["example.paid", "paid", generate, "paid"],
    ["example.other", "other", generate, "other"],
    ["example.local", "local", render, "local"],
  ] as const) {
    registry.registerFacet(createRuntimeEndpointAdapterFacet({
      use,
      activate: (context) => ({
        endpoint: defineEndpoint({
          instance: context.instance,
          pool: context.pool ?? context.instance,
          pricing: { kind: "local" },
          capabilities: [{ capability, returns, lifecycle: "immediate", handler: () => answer }],
        }),
      }),
    }));
  }
  const endpoints = { paid: { use: "example.paid" }, other: { use: "example.other" }, local: { use: "example.local" } };
  const need = { id: "need:1", capability: generate, returns, constraints: null, result: "record:1" };
  try {
    const unbound = join(root, "unbound.json");
    await writeFile(unbound, JSON.stringify(profile({ dataRoot: ".", endpoints })));
    assert.deepEqual(await describeRuntimeConfigEndpoints(unbound, [
      endpointQuery("generate", generate, returns, null),
      endpointQuery("render", render, returns, null),
    ], { registry }), [
      { need: "generate", capability: generate, status: "ambiguous", support: "not-evaluated", endpoints: ["other", "paid"] },
      { need: "render", capability: render, status: "resolved", support: "supported", endpoint: "local", use: "example.local", pricing: { kind: "local" } },
    ]);
    const contested = (await preflightRuntimeConfig(unbound, { registry, capabilities: [generate] })).diagnostics
      .filter((item) => item.code === "RUNTIME_CAPABILITY_AMBIGUOUS");
    assert.equal(contested.length, 1);
    assert.equal(contested[0]!.severity, "error");
    assert.match(contested[0]!.message, /add "bindings": \{ "example\.model@1#generate": "<instance>" \}/u);
    // Without a Run, doctor looks at every selected Endpoint and reports the contest as a warning.
    const idle = (await preflightRuntimeConfig(unbound, { registry })).diagnostics
      .find((item) => item.code === "RUNTIME_CAPABILITY_AMBIGUOUS");
    assert.equal(idle?.severity, "warning");
    await assert.rejects(invokeRuntimeConfigNeed(unbound, need, new MemoryResourceStore(), { registry }), /Say which one does it/u);

    const bound = join(root, "bound.json");
    await writeFile(bound, JSON.stringify(profile({ dataRoot: ".", endpoints, bindings: { [generateKey]: "other" } })));
    assert.deepEqual(await describeRuntimeConfigEndpoints(bound, [endpointQuery("generate", generate, returns, null)], { registry }), [
      { need: "generate", capability: generate, status: "resolved", support: "supported", endpoint: "other", use: "example.other", pricing: { kind: "local" }, binding: "other" },
    ]);
    assert.equal((await preflightRuntimeConfig(bound, { registry, capabilities: [generate] })).diagnostics
      .some((item) => item.code === "RUNTIME_CAPABILITY_AMBIGUOUS"), false);
    const fulfilled = await invokeRuntimeConfigNeed(bound, need, new MemoryResourceStore(), { registry });
    assert.deepEqual(fulfilled, ("other"));

    const wrong = join(root, "wrong.json");
    await writeFile(wrong, JSON.stringify(profile({ dataRoot: ".", endpoints, bindings: { [generateKey]: "local" } })));
    assert.deepEqual(await describeRuntimeConfigEndpoints(wrong, [endpointQuery("generate", generate, returns, null)], { registry }), [
      { need: "generate", capability: generate, status: "unresolved", support: "not-evaluated", binding: "local" },
    ]);
    assert.ok((await preflightRuntimeConfig(wrong, { registry, capabilities: [generate] })).diagnostics
      .some((item) => item.code === "RUNTIME_BINDING_INVALID"));
    await assert.rejects(invokeRuntimeConfigNeed(wrong, need, new MemoryResourceStore(), { registry }), /binds example\.model@1#generate to local, which does not offer this demand/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
