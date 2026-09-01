import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeCredentialStoreAdapterFacet,
  createRuntimeEndpointAdapterFacet,
  isRuntimeAdapterHostFacet,
  runtimeConfigBoolean,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
  RuntimeAdapterRegistry,
} from "@hypit/runtime-kit";
import type { RuntimeAdapterFactoryContext } from "@hypit/runtime-kit";

const context = { hostStateRoot: "/host", dataRoot: "/tmp", instance: "one", config: {} };
const endpointPackage = (instance: string) => ({
  name: instance,
  manifest: { facets: [] },
  instance: { id: instance },
  offers: [],
  credentials: [],
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
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.service",
    validate() {},
    open: () => ({ value: {} as never }),
  }));

  assert.ok(registry.has("example.endpoint", "endpoint"));
  assert.equal(registry.has("example.endpoint", "credential-store"), false);
  assert.ok(registry.has("example.service", "credential-store"));
  assert.equal(registry.has("example.service", "endpoint"), false);
});

test("Endpoint and Credential Store adapters may share one package address", () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.shared"));
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.shared",
    validate() {},
    open: () => ({ value: {} as never }),
  }));
  assert.ok(registry.has("example.shared", "endpoint"));
  assert.ok(registry.has("example.shared", "credential-store"));
});

test("asking an Endpoint adapter for a Credential Store is refused, not coerced", async () => {
  const registry = new RuntimeAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  await assert.rejects(async () => await registry.openCredentialStore("example.endpoint", context));
  await assert.rejects(async () => await registry.createEndpoint("example.absent", context));
});

test("a Credential Store adapter returns the selected Store directly", async () => {
  const registry = new RuntimeAdapterRegistry();
  const value = { resolve() {} } as never;
  registry.registerFacet(createRuntimeCredentialStoreAdapterFacet({
    use: "example.credentials",
    validate() {},
    open: () => ({ value }),
  }));
  assert.equal((await registry.openCredentialStore("example.credentials", context)).value, value);
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
