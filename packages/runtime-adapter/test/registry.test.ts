import assert from "node:assert/strict";
import test from "node:test";

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
import type { RuntimeAdapterFactoryContext } from "@narratage/runtime-adapter";

const context = { root: "/tmp", instance: "one", config: {} };
const endpointPackage = (instance: string, credentials: readonly unknown[] = []) => ({
  name: instance,
  manifest: { facets: [] },
  instance: { id: instance },
  bindings: [],
  credentials,
  install() {},
}) as never;
const endpoint = (use: string, extra: Record<string, unknown> = {}) =>
  createRuntimeEndpointAdapterFacet({
    use,
    activate: (value: RuntimeAdapterFactoryContext) => ({ endpoint: endpointPackage(value.instance), ...extra }),
  } as never);

test("a facet declares which kind it is, and the registry keeps the two apart", () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  registry.registerFacet(createRuntimeServiceAdapterFacet({
    use: "example.service",
    validate() {},
    create: () => ({}) as never,
  }));

  assert.ok(registry.has("example.endpoint", "endpoint"));
  assert.equal(registry.has("example.endpoint", "runtime-service"), false);
  assert.ok(registry.has("example.service", "runtime-service"));
  assert.equal(registry.has("example.service", "endpoint"), false);
  assert.equal(registry.has("example.absent"), false);
});

test("Endpoint and Runtime Service may intentionally share one logical spelling", () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.shared"));
  registry.registerFacet(createRuntimeServiceAdapterFacet({
    use: "example.shared",
    validate() {},
    create: () => ({ services: [] }) as never,
  }));
  assert.ok(registry.has("example.shared", "endpoint"));
  assert.ok(registry.has("example.shared", "runtime-service"));
});

test("asking an Endpoint adapter for a Runtime Service is refused, not coerced", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  await assert.rejects(async () => await registry.createService("example.endpoint", context));
  await assert.rejects(async () => await registry.createEndpoint("example.absent", context));
});

test("a Runtime Service adapter cannot escape its configured instance namespace", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeServiceAdapterFacet({
    use: "example.escaping-service",
    validate() {},
    create: () => ({ services: [{ instance: { id: "someone-else" } }] }) as never,
  }));
  await assert.rejects(
    async () => await registry.createService("example.escaping-service", context),
    /outside configured namespace one/u,
  );
});

test("one kind and logical name has one adapter, so a second registration is an error", () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  assert.throws(() => registry.registerFacet(endpoint("example.endpoint")), /already registered/u);
});

test("an Endpoint facet without activate() is not a facet", () => {
  assert.throws(
    () => createRuntimeEndpointAdapterFacet({ use: "x" } as never),
    /does not implement activate\(\)/u,
  );
  assert.throws(
    () => createRuntimeEndpointAdapterFacet({ use: "x", activate: 1 } as never),
    /does not implement activate\(\)/u,
  );
  assert.throws(
    () => createRuntimeEndpointAdapterFacet({ use: "  ", activate: () => ({}) } as never),
    /use name is empty/u,
  );
});

test("one activation validates and declares the selected Endpoint", async () => {
  let activated = 0;
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.validated",
    activate(value) {
      activated += 1;
      if (value.config !== null && typeof value.config === "object" && "bad" in value.config) {
        throw new Error("bad config");
      }
      return { endpoint: endpointPackage(value.instance) };
    },
  }));

  await assert.rejects(
    async () => await registry.activateEndpoint("example.validated", { ...context, config: { bad: true } }),
    /bad config/u,
  );
  const activation = await registry.activateEndpoint("example.validated", context);
  assert.equal(activation.endpoint.instance.id, "one");
  assert.equal(activated, 2);
});

test("credentials have one source: the activated Endpoint package", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(createRuntimeEndpointAdapterFacet({
    use: "example.credentials",
    activate(value) {
      return { endpoint: endpointPackage(value.instance, [{ slot: "token" }]) };
    },
  }));
  assert.deepEqual((await registry.activateEndpoint("example.credentials", context)).endpoint.credentials, [{ slot: "token" }]);
});

test("an external service is present only when the activation declares one", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.bare"));
  registry.registerFacet(endpoint("example.declaring", {
    externalService: { id: "thing", probe: async () => ({ state: "ready" as const }) },
  }));
  assert.equal((await registry.activateEndpoint("example.bare", context)).externalService, undefined);
  assert.equal((await registry.activateEndpoint("example.declaring", context)).externalService?.id, "thing");
});

test("an activation may add diagnostics without another configuration declaration", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.bare"));
  registry.registerFacet(endpoint("example.diagnosing", {
    diagnose: () => [{ severity: "warning" as const, code: "X", message: "m" }],
  }));
  const bare = await registry.activateEndpoint("example.bare", context);
  const diagnosing = await registry.activateEndpoint("example.diagnosing", context);
  assert.equal(bare.diagnose, undefined);
  assert.equal((await diagnosing.diagnose!()).length, 1);
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
 * ABI and offers carry the address. Identity must not repeat it.
 */
test("an adapter stores its address once", () => {
  const facet = endpoint("@narratage/example-provider");
  assert.equal("identity" in facet, false);
  assert.deepEqual(facet.offers, ["@narratage/example-provider"]);
  assert.equal(facet.abi, "svml.runtime-endpoint-adapter-host@1");
});
