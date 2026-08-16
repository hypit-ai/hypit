import assert from "node:assert/strict";
import test from "node:test";

import {
  RuntimeModuleRegistry,
  localSchedulerOptionsFromClosure,
  resolveRuntimeClosure,
  sealResolvedRuntimeProfile,
  verifyRuntimeClosure,
  verifyRuntimeCoverage,
  verifyResolvedRuntimeProfile,
} from "@narratage/runtime";
import type { RuntimeModuleManifest } from "@narratage/runtime";

import {
  capabilities,
  createGreetingBuild,
  types,
} from "../../core/test/greeting-fixture.js";

const runtimeModule = { name: "example.runtime-fixture", version: "1" } as const;
const endpointFacet = { module: runtimeModule, name: "greeting-endpoint" } as const;

function manifest(): RuntimeModuleManifest {
  return {
    format: "narratage.runtime-module@1",
    name: runtimeModule.name,
    version: runtimeModule.version,
    facets: [
      {
        name: "local-scheduler",
        role: "scheduler",
      },
      ...([
        ["local-worker", "worker"],
        ["memory-build-store", "build-store"],
        ["memory-operation-store", "operation-store"],
        ["memory-dispatch-store", "dispatch-store"],
        ["memory-artifact-store", "artifact-store"],
        ["memory-credential-store", "credential-store"],
      ] as const).map(([name, role]) => ({
        name,
        role,
      })),
      {
        name: endpointFacet.name,
        role: "capability-endpoint",
        fulfills: [{ capability: capabilities.generation, returns: types.generated }],
        lifecycle: "asynchronous",
        defaultConcurrency: 1,
      },
    ],
  };
}

function profile(options: { readonly operations?: boolean; readonly resource?: number } = {}) {
  return sealResolvedRuntimeProfile({
    instances: [
      { id: "scheduler.local", facet: { module: runtimeModule, name: "local-scheduler" } },
      { id: "worker.local", facet: { module: runtimeModule, name: "local-worker" } },
      { id: "build.memory", facet: { module: runtimeModule, name: "memory-build-store" } },
      ...(options.operations === false ? [] : [{
        id: "operations.memory",
        facet: { module: runtimeModule, name: "memory-operation-store" },
      }]),
      { id: "dispatch.memory", facet: { module: runtimeModule, name: "memory-dispatch-store" } },
      { id: "artifacts.memory", facet: { module: runtimeModule, name: "memory-artifact-store" } },
      { id: "credentials.memory", facet: { module: runtimeModule, name: "memory-credential-store" } },
      {
        id: "greeting.local",
        facet: endpointFacet,
        pool: "greeting.local",
      },
    ],
    scheduler: "scheduler.local",
    worker: "worker.local",
    stores: {
      build: "build.memory",
      operations: "operations.memory",
      dispatch: "dispatch.memory",
      artifacts: "artifacts.memory",
      credentials: ["credentials.memory"],
    },
    endpoints: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "greeting.local",
    }],
    scheduling: {
      maxConcurrency: 8,
      resources: [{ id: "pool:greeting.local", maxConcurrency: options.resource ?? 2 }],
    },
  });
}

test("Resolved Runtime resolves selected facets into one execution environment", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const first = resolveRuntimeClosure(registry, profile());
  const second = resolveRuntimeClosure(registry, profile());
  assert.deepEqual(first, second);
  assert.equal(first.instances.filter((instance) => instance.role === "scheduler").length, 1);
  const endpoint = first.instances.find((instance) => instance.id === "greeting.local");
  assert.equal(endpoint?.role, "capability-endpoint");
  if (endpoint?.role === "capability-endpoint") {
    assert.equal(endpoint.pool, "greeting.local");
    assert.equal(endpoint.maxConcurrency, 1);
  }
  assert.deepEqual(localSchedulerOptionsFromClosure(first).resourceLimits, {
    "pool:greeting.local": 2,
  });
  assert.doesNotThrow(() => verifyRuntimeCoverage(first, createGreetingBuild()));
});

test("Profile order does not change the resolved selection", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const normal = profile();
  const reordered = sealResolvedRuntimeProfile({
    ...normal,
    instances: [...normal.instances].reverse(),
    endpoints: [...normal.endpoints].reverse(),
    scheduling: { ...normal.scheduling, resources: [...normal.scheduling.resources].reverse() },
  });
  assert.deepEqual(
    resolveRuntimeClosure(registry, normal),
    resolveRuntimeClosure(registry, reordered),
  );
});

test("asynchronous Endpoints require an OperationStore before any paid execution", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  assert.throws(
    () => resolveRuntimeClosure(registry, profile({ operations: false })),
    /operations store/u,
  );
});

test("credentialed Endpoints require a selected CredentialStore", () => {
  const registry = new RuntimeModuleRegistry();
  const configured = manifest();
  registry.register({
    ...configured,
    facets: configured.facets.map((facet) => facet.role === "capability-endpoint"
      ? { ...facet, credentialSlots: ["apiKey"] }
      : facet),
  });
  const withoutCredentials = profile();
  assert.throws(
    () => resolveRuntimeClosure(registry, sealResolvedRuntimeProfile({
      ...withoutCredentials,
      stores: { ...withoutCredentials.stores, credentials: [] },
    })),
    /credentialed Endpoints require a CredentialStore/u,
  );
});

test("Coverage rejects an unbound demanded Need before the Scheduler starts", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const configured = profile();
  const unbound = sealResolvedRuntimeProfile({ ...configured, endpoints: [] });
  const closure = resolveRuntimeClosure(registry, unbound);
  assert.throws(
    () => verifyRuntimeCoverage(closure, createGreetingBuild()),
    /does not bind demanded capability/u,
  );
});

test("Runtime Closure content is structurally validated", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const closure = resolveRuntimeClosure(registry, profile());
  const invalid = structuredClone(closure);
  (invalid.scheduling as { maxConcurrency: number }).maxConcurrency = 0;
  assert.throws(() => verifyRuntimeClosure(invalid), /positive safe integer/u);
});

test("unsupported Runtime formats are rejected instead of being reinterpreted", () => {
  const registry = new RuntimeModuleRegistry();
  assert.throws(
    () => registry.register({ ...manifest(), format: "narratage.runtime-module@invalid" } as never),
    /unsupported Runtime Module Manifest format/u,
  );

  const configured = profile();
  assert.throws(
    () => verifyResolvedRuntimeProfile({ ...configured, format: "narratage.resolved-runtime@invalid" } as never),
    /unsupported Resolved Runtime format/u,
  );

  registry.register(manifest());
  const closure = resolveRuntimeClosure(registry, configured);
  assert.throws(
    () => verifyRuntimeClosure({ ...closure, format: "narratage.runtime-closure@invalid" } as never),
    /unsupported Runtime Closure format/u,
  );
});
