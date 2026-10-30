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
import { FileBuildResultStore } from "@hypit/result/runtime-storage/node";
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

test("transient execution follows capability opt-in rather than pricing and keeps Profile bindings", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-transient-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { remote: { use: "example.remote" }, local: { use: "example.local" } },
    bindings: { "example.runtime-scenario@0.0.0#generate-greeting-text": "remote" },
  })));
  let remoteCalls = 0;
  let localCalls = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({
      value: {
        async resolve(ref) {
          return ref.store === "secrets" && ref.key === "remote.key"
            ? { secret: "available" }
            : undefined;
        },
      },
    }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.remote",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        credentials: { apiKey: credentialRef("secrets", "remote.key") },
        pricing: { kind: "page", url: "https://prices.example/models" },
        capabilities: [{
          capability: greetingCapabilities.generation,
          returns: greetingTypes.generated,
          lifecycle: "immediate",
          transient: true,
          supports: (need) => (need.constraints as { readonly prompt?: unknown }).prompt === "Greet Ada"
            ? { status: "supported" }
            : { status: "unsupported", reason: "prompt must be Greet Ada" },
          handler: ({ request, credentials }) => {
            remoteCalls += 1;
            assert.deepEqual(request.constraints, { prompt: "Greet Ada" });
            assert.equal(credentials.apiKey?.secret, "available");
            return "Hello, Ada!";
          },
        }],
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
        capabilities: [{
          capability: greetingCapabilities.generation,
          returns: greetingTypes.generated,
          lifecycle: "immediate",
          handler: () => {
            localCalls += 1;
            return "wrong";
          },
        }],
      }),
    }),
  }));
  try {
    const execution = await openTransientRuntimeConfigExecution(path, { registry });
    const completed = await execution.evaluate({
      state: createGreetingBuild({ targetOutputs: ["generated"] }),
      producers: greetingProducers(),
      refinements: new RefinementRegistry(),
      resources: new MemoryResourceStore(),
    });
    assert.equal(completed.status, "complete");
    assert.equal(remoteCalls, 1, "pricing metadata does not exclude an explicitly transient capability");
    assert.equal(localCalls, 0);

    const unsupportedBase = createGreetingBuild({ targetOutputs: ["generated"] });
    const grace = (record: (typeof unsupportedBase.records)[number]) => record.id === "intent:root"
      ? { ...record, value: ({ name: "Grace" }) }
      : record;
    const unsupported = {
      ...unsupportedBase,
      records: unsupportedBase.records.map(grace),
      program: {
        ...unsupportedBase.program,
        records: unsupportedBase.program.records.map(grace),
      },
    };
    const rejected = await execution.evaluate({
      state: unsupported,
      producers: greetingProducers(),
      refinements: new RefinementRegistry(),
      resources: new MemoryResourceStore(),
    });
    assert.equal(rejected.status, "paused");
    assert.equal(remoteCalls, 1, "supports receives the complete Need before a transient handler runs");
    await execution.close();

    await writeFile(path, JSON.stringify(profile({
      dataRoot: ".",
      credentials: { secrets: { use: "example.credentials" } },
      endpoints: { remote: { use: "example.remote" }, local: { use: "example.local" } },
      bindings: { "example.runtime-scenario@0.0.0#generate-greeting-text": "local" },
    })));
    const boundExecution = await openTransientRuntimeConfigExecution(path, { registry });
    const blocked = await boundExecution.evaluate({
      state: createGreetingBuild({ targetOutputs: ["generated"] }),
      producers: greetingProducers(),
      refinements: new RefinementRegistry(),
      resources: new MemoryResourceStore(),
    });
    assert.equal(blocked.status, "paused");
    assert.match(blocked.blocked[0]?.subject ?? "", /local/u,
      "a binding to a non-transient Endpoint must not fall back to another Endpoint");
    assert.equal(remoteCalls, 1);
    assert.equal(localCalls, 0);
    await boundExecution.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("transient execution applies the Profile's Producer inline Value budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-producer-budget-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify({ ...profile({ dataRoot: "." }),
    execution: { producerInlineValueBytes: 16 } }));
  const producers = new ProducerRegistry();
  producers.registerProducer(greetingProducerRefs.makePrompt, ({ limits }) => {
    assert.equal(limits.maxInlineValueBytes, 16);
    return { kind: "output", value: "larger than sixteen bytes" };
  });
  try {
    const execution = await openTransientRuntimeConfigExecution(path, { registry: new RuntimeAdapterRegistry() });
    try {
      const result = await execution.evaluate({
        state: createGreetingBuild(),
        producers,
        refinements: new RefinementRegistry(),
        resources: new MemoryResourceStore(),
      });
      assert.equal(result.status, "failed");
      assert.match(result.outcomes.at(-1)?.message ?? "", /inline Value bytes; limit is 16 bytes/u);
    } finally {
      await execution.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("Runtime invoke executes one immediate Need through the selected Endpoint and its credential, outside any Build", async () => {
  const root = await mkdtemp(join(tmpdir(), "hypit-runtime-invoke-"));
  const path = join(root, "hypit.runtime.json");
  await writeFile(path, JSON.stringify(profile({
    dataRoot: ".",
    credentials: { secrets: { use: "example.credentials" } },
    endpoints: { paid: { use: "example.paid" }, slow: { use: "example.slow" } },
  })));
  const observe = { module: { name: "example.model", version: "1" }, name: "observe" } as const;
  const generate = { module: { name: "example.model", version: "1" }, name: "generate" } as const;
  const missing = { module: { name: "example.model", version: "1" }, name: "transcribe" } as const;
  const returns = { module: { name: "example.value", version: "1" }, name: "Output" } as const;
  let configured = true;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({
      value: {
        async resolve(ref) {
          return configured && ref.store === "secrets" && ref.key === "paid.key" ? { secret: "configured" } : undefined;
        },
      },
    }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.paid",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        credentials: { apiKey: credentialRef("secrets", "paid.key") },
        capabilities: [{
          capability: observe,
          returns,
          lifecycle: "immediate",
          handler: async ({ request, credentials, reportProgress, reportDiagnostic }) => {
            await reportProgress?.({ phase: "Aligning words" });
            await reportDiagnostic?.({ level: "info", message: "Timing ready" });
            return { seen: request.constraints, key: credentials.apiKey?.secret ?? null };
          },
        }],
      }),
    }),
  }));
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.slow",
    activate: (context) => ({
      endpoint: defineEndpoint({
        instance: context.instance,
        pool: context.pool ?? context.instance,
        capabilities: [{
          capability: generate,
          returns,
          lifecycle: "asynchronous",
          endpoint: {
            start: async () => ({ status: "completed" as const, result: null }),
            poll: async () => ({ status: "completed" as const, result: null }),
          },
        }],
      }),
    }),
  }));
  const resources = { async get() { return undefined; }, async put() { throw new Error("unused"); } } as never;
  const need = (capability: typeof observe | typeof generate | typeof missing) => ({
    id: "need:creation-time", capability, returns, constraints: { question: "what happens?" }, result: "record:creation-time",
  });
  try {
    const messages: string[] = [];
    assert.deepEqual(await invokeRuntimeConfigNeed(path, need(observe), resources, {
      registry,
      reportProgress: async (event) => { messages.push(event.phase); },
      reportDiagnostic: async (event) => { messages.push(event.message); },
    }), { seen: { question: "what happens?" }, key: "configured" });
    assert.deepEqual(messages, ["Aligning words", "Timing ready"]);
    await assert.rejects(invokeRuntimeConfigNeed(path, need(missing), resources, { registry }), /No Endpoint in .* serves example\.model@1#transcribe/u);
    await assert.rejects(invokeRuntimeConfigNeed(path, need(generate), resources, { registry }), /asynchronous capability/u);
    configured = false;
    await assert.rejects(invokeRuntimeConfigNeed(path, need(observe), resources, { registry }), /apiKey for Endpoint paid is not configured/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
