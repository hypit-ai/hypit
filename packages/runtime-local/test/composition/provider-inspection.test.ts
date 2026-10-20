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

test("Runtime Endpoint observations name the selected Endpoint and its declared price source without contacting a service", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-providers-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { paid: { use: "example.paid" }, local: { use: "example.local" } },
  })));
  const generate = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const render = { module: { name: "example.render", version: "1" }, name: "render" } as const;
  const missing = { module: { name: "example.model", version: "1" }, name: "transcribe" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  const handler = () => ({ value: (null) });
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.paid",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        pricing: { kind: "page", url: "https://prices.example/models" },
        capabilities: [{ capability: generate, returns, lifecycle: "immediate", handler }],
      }),
    }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.local",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        pricing: { kind: "local" },
        capabilities: [{ capability: render, returns, lifecycle: "immediate", handler }],
      }),
    }),
  }));
  try {
    assert.deepEqual(await describeRuntimeConfigEndpoints(path, [
      endpointQuery("generate", generate, returns),
      endpointQuery("render", render, returns),
      endpointQuery("missing", missing, returns),
    ], { registry }), [
      {
        need: "generate",
        capability: generate,
        status: "resolved",
        support: "supported",
        endpoint: "paid",
        use: "example.paid",
        pricing: { kind: "page", url: "https://prices.example/models" },
      },
      { need: "render", capability: render, status: "resolved", support: "supported", endpoint: "local", use: "example.local", pricing: { kind: "local" } },
      { need: "missing", capability: missing, status: "unresolved", support: "not-evaluated" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("one Runtime inspection freezes its Profile and reuses one Endpoint activation through preflight and execution", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-inspection-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { selected: { use: "example.selected" } },
  })));
  const capability = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  let activations = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.selected",
    activate: (context) => {
      activations += 1;
      return { endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        capabilities: [{
          capability,
          returns,
          lifecycle: "immediate",
          handler: () => ({ value: (null) }),
        }],
      }) };
    },
  }));
  const inspection = await openRuntimeConfigInspection(path, [
    endpointDemand("blocked", capability, returns),
  ], { registry });
  let runtime: Awaited<ReturnType<typeof inspection.createRuntime>> | undefined;
  try {
    assert.equal(activations, 1);
    await writeFile(path, JSON.stringify(profile({ dataRoot: ".", endpoints: {} })));
    assert.deepEqual(await inspection.endpoints(), [{
      need: "blocked",
      capability,
      status: "resolved",
      support: "not-evaluated",
      endpoint: "selected",
      use: "example.selected",
    }]);
    assert.deepEqual(await inspection.preflight(), { dataRoot: root, diagnostics: [] });
    runtime = await inspection.createRuntime();
    assert.equal(activations, 1);
  } finally {
    await runtime?.close();
    await inspection.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Runtime pricing reads Provider-owned material with only the selected Endpoint's credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-pricing-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { paid: { use: "example.paid" }, local: { use: "example.local" } },
  })));
  const generate = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const render = { module: { name: "example.render", version: "1" }, name: "render" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  const handler = () => ({ value: (null) });
  let pricingReads = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({ value: {
      async resolve(ref) {
        return ref.store === "secrets" && ref.key === "paid.key" ? { secret: "selected-key" } : undefined;
      },
    } }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.paid",
    activate: (context) => ({ endpoint: defineEndpoint({
      instance: context.instance, pool: context.pool ?? context.instance,
      credentials: { apiKey: credentialRef("secrets", "paid.key") },
      pricing: { kind: "page", url: "https://prices.example/models" },
      readPricing: async ({ request, credentials }) => {
        pricingReads += 1;
        const resolved = await credentials();
        assert.equal(resolved.apiKey?.secret, "selected-key");
        assert.deepEqual(request.constraints, { seconds: 5 });
        return [{ source: "https://prices.example/models/generate", data: { usdPerSecond: 0.25 }, summary: "USD 0.25 per second" }];
      },
      capabilities: [{ capability: generate, returns, lifecycle: "immediate", handler }],
    }) }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.local",
    activate: (context) => ({ endpoint: defineEndpoint({
      instance: context.instance, pool: context.pool ?? context.instance, pricing: { kind: "local" },
      capabilities: [{ capability: render, returns, lifecycle: "immediate", handler }],
    }) }),
  }));
  try {
    assert.deepEqual(await readRuntimeConfigPricing(path, [
      endpointDemand("blocked-generate", generate, returns),
      endpointQuery("generate", generate, returns, { seconds: 5 }),
      endpointQuery("render", render, returns, null),
    ], { registry }), [{
      need: "blocked-generate", capability: generate, status: "resolved", support: "not-evaluated",
      endpoint: "paid", use: "example.paid", pricing: { kind: "page", url: "https://prices.example/models" },
    }, {
      need: "generate", capability: generate, status: "resolved", support: "supported", endpoint: "paid", use: "example.paid",
      pricing: { kind: "page", url: "https://prices.example/models" },
      pricingDocuments: [{
        source: "https://prices.example/models/generate",
        data: { usdPerSecond: 0.25 },
        summary: "USD 0.25 per second",
      }],
    }, {
      need: "render", capability: render, status: "resolved", support: "supported", endpoint: "local", use: "example.local",
      pricing: { kind: "local" },
    }]);
    assert.equal(pricingReads, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("Runtime provider inspection applies Endpoint supports when the complete request is available", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-provider-supports-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    endpoints: { narrow: { use: "example.narrow" } },
  })));
  const capability = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  let supportCalls = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.narrow",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        pricing: { kind: "local" },
        capabilities: [{
          capability,
          returns,
          lifecycle: "immediate",
          supports: (need) => {
            supportCalls += 1;
            return (need.constraints as { readonly allowed?: unknown } | null)?.allowed === true
              && (need.constraints as { readonly reference?: unknown }).reference === "image"
              ? { status: "supported" }
              : { status: "unsupported", reason: "request needs allowed=true and reference=image" };
          },
          handler: () => ({ value: (null) }),
        }],
      }),
    }),
  }));
  try {
    assert.deepEqual(await describeRuntimeConfigEndpoints(path, [
      endpointDemand("blocked", capability, returns),
      endpointQuery("empty", capability, returns),
      endpointQuery("complete", capability, returns, { allowed: false }),
      endpointQuery("accepted", capability, returns, { allowed: true, reference: "image" }),
    ], { registry }), [
      {
        need: "blocked",
        capability,
        status: "resolved",
        support: "not-evaluated",
        endpoint: "narrow",
        use: "example.narrow",
        pricing: { kind: "local" },
      },
      {
        need: "empty",
        capability,
        status: "resolved",
        support: "unsupported",
        endpoint: "narrow",
        use: "example.narrow",
        pricing: { kind: "local" },
        rejections: [{ endpoint: "narrow", message: "request needs allowed=true and reference=image" }],
      },
      {
        need: "complete",
        capability,
        status: "resolved",
        support: "unsupported",
        endpoint: "narrow",
        use: "example.narrow",
        pricing: { kind: "local" },
        rejections: [{ endpoint: "narrow", message: "request needs allowed=true and reference=image" }],
      },
      { need: "accepted", capability, status: "resolved", support: "supported", endpoint: "narrow", use: "example.narrow", pricing: { kind: "local" } },
    ]);
    assert.equal(supportCalls, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
