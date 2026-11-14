import assert from "node:assert/strict";
import test from "node:test";

import {
  createExecutionEnvironmentCredentialStoreAdapterFacet,
  createExecutionEnvironmentEndpointAdapterFacet,
  isExecutionEnvironmentAdapterFacet,
  executionEnvironmentConfigBoolean,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
  ExecutionEnvironmentAdapterRegistry,
} from "@hypit/execution-environment-local/extension";
import type { ExecutionEnvironmentAdapterFactoryContext } from "@hypit/execution-environment-local/extension";

const context = { hostStateRoot: "/host", dataRoot: "/tmp", instance: "one", config: {} };
const endpointInstance = (instance: string) => ({
  name: instance,
  manifest: { facets: [] },
  instance: { id: instance, pool: instance },
  capabilities: [],
  credentials: [],
}) as never;
const endpoint = (use: string, extra: Record<string, unknown> = {}) =>
  createExecutionEnvironmentEndpointAdapterFacet({
    use,
    activate: (value: ExecutionEnvironmentAdapterFactoryContext) => ({ endpoint: endpointInstance(value.instance), ...extra }),
  } as never);

test("Endpoint and Credential Store adapters may share one package address", () => {
  const registry = new ExecutionEnvironmentAdapterRegistry();
  registry.registerFacet(endpoint("example.shared"));
  registry.registerFacet(createExecutionEnvironmentCredentialStoreAdapterFacet({
    use: "example.shared",
    validate() {},
    open: () => ({ value: {} as never }),
  }));
  assert.ok(registry.has("example.shared", "endpoint"));
  assert.ok(registry.has("example.shared", "credential-store"));
});

test("one kind and logical name has one adapter, so a second registration is an error", () => {
  const registry = new ExecutionEnvironmentAdapterRegistry();
  registry.registerFacet(endpoint("example.endpoint"));
  assert.throws(() => registry.registerFacet(endpoint("example.endpoint")), /already registered/u);
});

test("an Endpoint facet without activate() is not a facet", () => {
  assert.throws(
    () => createExecutionEnvironmentEndpointAdapterFacet({ use: "x" } as never),
    /does not implement activate\(\)/u,
  );
  assert.throws(
    () => createExecutionEnvironmentEndpointAdapterFacet({ use: "x", activate: 1 } as never),
    /does not implement activate\(\)/u,
  );
  assert.throws(
    () => createExecutionEnvironmentEndpointAdapterFacet({ use: "  ", activate: () => ({}) } as never),
    /use name is empty/u,
  );
});

test("one activation validates and declares the selected Endpoint", async () => {
  let activated = 0;
  const registry = new ExecutionEnvironmentAdapterRegistry();
  registry.registerFacet(createExecutionEnvironmentEndpointAdapterFacet({
    use: "example.validated",
    activate(value) {
      activated += 1;
      if (value.config !== null && typeof value.config === "object" && "bad" in value.config) {
        throw new Error("bad config");
      }
      return { endpoint: endpointInstance(value.instance) };
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

test("a produced facet is recognisable as an Environment Adapter facet", () => {
  assert.ok(isExecutionEnvironmentAdapterFacet(endpoint("example.endpoint")));
  assert.equal(isExecutionEnvironmentAdapterFacet({ kind: "something-else" } as never), false);
});

test("Environment config readers accept a value or refuse it; they never guess one", () => {
  const config = executionEnvironmentConfigObject({ a: "x", n: 2, b: true }, "subject");
  assert.equal(executionEnvironmentConfigString(config.a, "a"), "x");
  assert.equal(executionEnvironmentConfigPositiveInteger(config.n, "n"), 2);
  assert.equal(executionEnvironmentConfigBoolean(config.b, "b"), true);
  // Absence is absence, not a default.
  assert.equal(executionEnvironmentConfigString(undefined, "a"), undefined);
  assert.equal(executionEnvironmentConfigPositiveInteger(undefined, "n"), undefined);
  assert.equal(executionEnvironmentConfigBoolean(undefined, "b"), undefined);

  assert.throws(() => executionEnvironmentConfigObject([] as never, "subject"), /must be an object/u);
  assert.throws(() => executionEnvironmentConfigString(1 as never, "a"), /a/u);
  assert.throws(() => executionEnvironmentConfigPositiveInteger(0 as never, "n"), /n/u);
  assert.throws(() => executionEnvironmentConfigPositiveInteger(1.5 as never, "n"), /n/u);
  assert.throws(() => executionEnvironmentConfigBoolean("true" as never, "b"), /b/u);
  // An unknown key is a misconfiguration, not something to ignore.
  assert.throws(() => executionEnvironmentConfigExact(config, ["a", "n"], "subject"), /does not accept b/u);
  assert.doesNotThrow(() => executionEnvironmentConfigExact(config, ["a", "n", "b"], "subject"));
});
