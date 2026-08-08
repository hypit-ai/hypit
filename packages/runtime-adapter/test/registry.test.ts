import assert from "node:assert/strict";
import test from "node:test";

import { digestOf } from "@narratage/protocol";

import {
  createRuntimeEndpointAdapterFacet,
  createRuntimeServiceAdapterFacet,
  isRuntimeAdapterHostFacet,
  runtimeConfigBoolean,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
  RuntimeAdapterRegistry,
} from "@narratage/runtime-adapter";

const context = { root: "/tmp", instance: "one", config: {} };
const endpoint = (use: string, extra: Record<string, unknown> = {}) =>
  createRuntimeEndpointAdapterFacet({ use, create: () => ({ use }) as never, ...extra } as never);

test("a facet declares which kind it is, and the registry keeps the two apart", () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  registry.registerFacet(createRuntimeServiceAdapterFacet({
    use: "example.service",
    create: () => ({}) as never,
  }));

  assert.ok(registry.has("example.endpoint", "endpoint"));
  assert.equal(registry.has("example.endpoint", "runtime-service"), false);
  assert.ok(registry.has("example.service", "runtime-service"));
  assert.equal(registry.has("example.service", "endpoint"), false);
  assert.equal(registry.has("example.absent"), false);
});

test("asking an Endpoint adapter for a Runtime Service is refused, not coerced", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  await assert.rejects(async () => await registry.createService("example.endpoint", context));
  await assert.rejects(async () => await registry.createEndpoint("example.absent", context));
});

test("one name is one adapter, so a second registration is an error rather than a winner", () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  assert.throws(() => registry.registerFacet(endpoint("example.endpoint")), /already registered/u);
});

test("a facet without create() is not a facet", () => {
  assert.throws(
    () => createRuntimeEndpointAdapterFacet({ use: "x" } as never),
    /does not implement create\(\)/u,
  );
  assert.throws(
    () => createRuntimeEndpointAdapterFacet({ use: "x", create: () => ({}), doctor: 1 } as never),
    /doctor must be a function/u,
  );
  assert.throws(() => createRuntimeEndpointAdapterFacet({ use: "  ", create: () => ({}) } as never), /use name is empty/u);
});

test("an external service is present only when the adapter declares one", () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.bare"));
  registry.registerFacet(endpoint("example.declaring", {
    service: () => ({ id: "thing", probe: async () => ({ state: "ready" as const }) }),
  }));
  assert.equal(registry.service("example.bare", context), undefined);
  assert.equal(registry.service("example.declaring", context)?.id, "thing");
});

test("an adapter with no doctor reports nothing rather than failing", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.bare"));
  registry.registerFacet(endpoint("example.diagnosing", {
    doctor: () => [{ severity: "warning" as const, code: "X", message: "m" }],
  }));
  assert.deepEqual(await registry.doctor("example.bare", "endpoint", context), []);
  assert.equal((await registry.doctor("example.diagnosing", "endpoint", context)).length, 1);
});

test("a produced facet is recognisable as a Runtime Adapter host facet", () => {
  assert.ok(isRuntimeAdapterHostFacet(endpoint("example.endpoint")));
  assert.equal(isRuntimeAdapterHostFacet({ abi: "something-else" } as never), false);
});

test("Runtime config readers accept a value or refuse it; they never guess one", () => {
  const config = runtimeConfigObject({ a: "x", n: 2, b: true }, "subject");
  assert.equal(runtimeConfigString(config.a, "a"), "x");
  assert.equal(runtimeConfigPositiveInteger(config.n, "n"), 2);
  assert.equal(runtimeConfigBoolean(config.b, "b"), true);
  // Absence is absence, not a default.
  assert.equal(runtimeConfigString(undefined, "a"), undefined);
  assert.equal(runtimeConfigPositiveInteger(undefined, "n"), undefined);
  assert.equal(runtimeConfigBoolean(undefined, "b"), undefined);

  assert.throws(() => runtimeConfigObject([] as never, "subject"), /must be an object/u);
  assert.throws(() => runtimeConfigString(1 as never, "a"), /a/u);
  assert.throws(() => runtimeConfigPositiveInteger(0 as never, "n"), /n/u);
  assert.throws(() => runtimeConfigPositiveInteger(1.5 as never, "n"), /n/u);
  assert.throws(() => runtimeConfigBoolean("true" as never, "b"), /b/u);
  // An unknown key is a misconfiguration, not something to ignore.
  assert.throws(() => runtimeConfigExact(config, ["a", "n"], "subject"), /does not accept b/u);
  assert.doesNotThrow(() => runtimeConfigExact(config, ["a", "n", "b"], "subject"));
});

/**
 * Pin.
 *
 * A package lock records a `facetsDigest` derived from these identities. If the
 * identity of an unchanged adapter shifted, every recorded lock would fail
 * verification for a reason nobody changed on purpose — which has happened once
 * already, when `kind` was renamed. The constant makes that a visible edit.
 */
test("an unchanged adapter keeps its identity, because locks are addressed by it", () => {
  const facet = endpoint("@narratage/example-provider");
  assert.deepEqual(facet.identity, {
    contract: "svml.runtime-adapter-facet@1",
    use: "@narratage/example-provider",
    kind: "endpoint",
  });
  assert.equal(digestOf(facet.identity),
    "sha256:c9ce6e18b3d02f65148cfc06b016ae0a7dee00430558bb393472726fb91a756f");
});
