import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/core";
import {
  RuntimeModuleRegistry,
  localSchedulerOptionsFromClosure,
  resolveRuntimeProfile,
  sealRuntimeProfile,
  verifyRuntimeClosure,
  verifyRuntimeCoverage,
  verifyRuntimeProfile,
} from "@narratage/runtime";
import type { RuntimeModuleManifest } from "@narratage/runtime";

import {
  capabilities,
  createGreetingBuild,
  types,
} from "../../core/test/greeting-fixture.js";

const runtimeModule = { name: "example.runtime-fixture", version: "1" } as const;
const endpointFacet = { module: runtimeModule, name: "greeting-endpoint" } as const;
const endpointImplementationDigest = digestOf("example.runtime-fixture/greeting-endpoint@1");

function manifest(permissions: readonly string[] = []): RuntimeModuleManifest {
  return {
    format: "svml.runtime-module@1",
    name: runtimeModule.name,
    version: runtimeModule.version,
    facets: [
      {
        name: "local-scheduler",
        role: "scheduler",
        implementation: {
          locator: "example.runtime-fixture/local-scheduler",
          digest: digestOf("example.runtime-fixture/local-scheduler@1"),
        },
        permissions: [],
      },
      {
        name: "memory-build-store",
        role: "build-store",
        implementation: {
          locator: "example.runtime-fixture/memory-build-store",
          digest: digestOf("example.runtime-fixture/memory-build-store@1"),
        },
        permissions: [],
      },
      {
        name: "memory-operation-store",
        role: "operation-store",
        implementation: {
          locator: "example.runtime-fixture/memory-operation-store",
          digest: digestOf("example.runtime-fixture/memory-operation-store@1"),
        },
        permissions: [],
      },
      {
        name: endpointFacet.name,
        role: "capability-endpoint",
        implementation: {
          locator: "example.runtime-fixture/greeting-endpoint",
          digest: endpointImplementationDigest,
        },
        permissions,
        fulfills: [{ capability: capabilities.generation, returns: types.generated }],
        lifecycle: "recoverable",
        defaultConcurrency: 1,
      },
    ],
  };
}

function profile(options: { readonly operations?: boolean; readonly lane?: number } = {}) {
  return sealRuntimeProfile({
    name: "fixture.local",
    instances: [
      { id: "scheduler.local", facet: { module: runtimeModule, name: "local-scheduler" } },
      { id: "build.memory", facet: { module: runtimeModule, name: "memory-build-store" } },
      ...(options.operations === false ? [] : [{
        id: "operations.memory",
        facet: { module: runtimeModule, name: "memory-operation-store" },
      }]),
      {
        id: "greeting.local",
        facet: endpointFacet,
        lane: "endpoint:greeting.local",
      },
    ],
    scheduler: "scheduler.local",
    stores: {
      build: "build.memory",
      ...(options.operations === false ? {} : { operations: "operations.memory" }),
    },
    endpoints: [{
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: "greeting.local",
    }],
    scheduling: {
      maxConcurrency: 8,
      lanes: [{ name: "endpoint:greeting.local", maxConcurrency: options.lane ?? 2 }],
    },
  });
}

test("Runtime Profile resolves installed static facets into one deterministic locked Closure", () => {
  const registry = new RuntimeModuleRegistry();
  const manifestDigest = registry.register(manifest());
  const first = resolveRuntimeProfile(registry, profile());
  const second = resolveRuntimeProfile(registry, profile());
  assert.equal(first.digest, second.digest);
  assert.equal(first.modules[0]?.digest, manifestDigest);
  assert.equal(first.instances.filter((instance) => instance.role === "scheduler").length, 1);
  const endpoint = first.instances.find((instance) => instance.id === "greeting.local");
  assert.equal(endpoint?.role, "capability-endpoint");
  if (endpoint?.role === "capability-endpoint") {
    assert.equal(endpoint.implementation.digest, endpointImplementationDigest);
    assert.equal(endpoint.lane, "endpoint:greeting.local");
    assert.equal(endpoint.maxConcurrency, 2);
  }
  assert.deepEqual(localSchedulerOptionsFromClosure(first).laneLimits, {
    "endpoint:greeting.local": 2,
  });
  assert.doesNotThrow(() => verifyRuntimeCoverage(first, createGreetingBuild()));
});

test("Profile order is not identity but an execution-policy change is", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const normal = profile();
  const reordered = sealRuntimeProfile({
    ...normal,
    instances: [...normal.instances].reverse(),
    endpoints: [...normal.endpoints].reverse(),
    scheduling: { ...normal.scheduling, lanes: [...normal.scheduling.lanes].reverse() },
  });
  assert.equal(normal.digest, reordered.digest);
  assert.notEqual(
    resolveRuntimeProfile(registry, normal).digest,
    resolveRuntimeProfile(registry, profile({ lane: 1 })).digest,
  );
});

test("non-secret instance configuration is locked independently from implementation bytes", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const original = profile();
  const configured = sealRuntimeProfile({
    ...original,
    instances: original.instances.map((instance) => instance.id === "greeting.local"
      ? { ...instance, configurationDigest: digestOf({ baseUrl: "https://provider.example" }) }
      : instance),
  });
  assert.notEqual(original.digest, configured.digest);
  assert.notEqual(
    resolveRuntimeProfile(registry, original).digest,
    resolveRuntimeProfile(registry, configured).digest,
  );
});

test("recoverable Endpoints require an OperationStore before any paid execution", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  assert.throws(
    () => resolveRuntimeProfile(registry, profile({ operations: false })),
    /require an OperationStore/u,
  );
});

test("credentialed Endpoints require an explicitly selected CredentialStore", () => {
  const registry = new RuntimeModuleRegistry();
  const configured = manifest();
  registry.register({
    ...configured,
    facets: configured.facets.map((facet) => facet.role === "capability-endpoint"
      ? { ...facet, credentialSlots: ["apiKey"] }
      : facet),
  });
  assert.throws(
    () => resolveRuntimeProfile(registry, profile()),
    /require a CredentialStore/u,
  );
});

test("Runtime permissions require an explicit Host allowlist", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest(["network", "credentials:greeting"]));
  assert.throws(() => resolveRuntimeProfile(registry, profile()), /disallowed Runtime permission/u);
  assert.doesNotThrow(() => resolveRuntimeProfile(registry, profile(), {
    allowedPermissions: ["credentials:greeting", "network"],
  }));
});

test("Coverage rejects an unbound demanded Need before the Scheduler starts", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const configured = profile();
  const unbound = sealRuntimeProfile({ ...configured, endpoints: [] });
  const closure = resolveRuntimeProfile(registry, unbound);
  assert.throws(
    () => verifyRuntimeCoverage(closure, createGreetingBuild()),
    /does not bind demanded capability/u,
  );
});

test("Runtime Closure content cannot be changed without invalidating its digest", () => {
  const registry = new RuntimeModuleRegistry();
  registry.register(manifest());
  const closure = resolveRuntimeProfile(registry, profile());
  const tampered = structuredClone(closure);
  (tampered.scheduling as { maxConcurrency: number }).maxConcurrency = 999;
  assert.throws(() => verifyRuntimeClosure(tampered), /digest differs/u);
});

test("Runtime @1 facts are rejected instead of being reinterpreted as Endpoint bindings", () => {
  const registry = new RuntimeModuleRegistry();
  assert.throws(
    () => registry.register({ ...manifest(), format: "svml.runtime-module@invalid" } as never),
    /unsupported Runtime Module Manifest format/u,
  );

  const configured = profile();
  assert.throws(
    () => verifyRuntimeProfile({ ...configured, format: "svml.runtime-profile@invalid" } as never),
    /unsupported Runtime Profile format/u,
  );

  registry.register(manifest());
  const closure = resolveRuntimeProfile(registry, configured);
  assert.throws(
    () => verifyRuntimeClosure({ ...closure, format: "svml.runtime-closure@invalid" } as never),
    /unsupported Runtime Closure format/u,
  );
});
