import assert from "node:assert/strict";
import test from "node:test";

import { ProviderRegistry } from "@svml/driver-node";
import { defineProviderPackage, wakeAfter } from "@svml/provider-kit";
import { credentialRef } from "@svml/runtime";
import { digestOf } from "@svml/protocol";

import { capabilities, types } from "../../core/test/greeting-fixture.js";

const implementation = {
  locator: "example.provider/http-json",
  digest: digestOf("example.provider/http-json@1"),
} as const;

test("one Provider definition generates Manifest, instance, bindings and registration", async () => {
  const provider = defineProviderPackage({
    module: { name: "example.provider", version: "1" },
    facet: "http-json",
    instance: "example.personal",
    implementation,
    permissions: ["network:example.test"],
    configuration: { baseUrl: "https://example.test" },
    credentials: { apiKey: credentialRef("env", "EXAMPLE_API_KEY") },
    defaultConcurrency: 3,
    capabilities: [{
      lifecycle: "immediate",
      capability: capabilities.generation,
      returns: types.generated,
      handler: () => ({
        value: { kind: "inline", value: "generated" },
        conformance: "exact",
        delivery: "executed",
        metadata: {},
      }),
    }],
  });
  assert.equal(provider.manifest.facets[0]?.role, "provider-endpoint");
  assert.equal(provider.manifest.facets[0]?.defaultConcurrency, 3);
  assert.deepEqual(provider.manifest.facets[0]?.credentialSlots, ["apiKey"]);
  assert.equal(provider.instance.id, "example.personal");
  assert.ok(provider.instance.configurationDigest);
  assert.deepEqual(provider.bindings, [{
    capability: capabilities.generation,
    returns: types.generated,
    endpoint: "example.personal",
  }]);

  const registry = new ProviderRegistry();
  await provider.install(registry);
  const [registration] = registry.providers(capabilities.generation);
  assert.equal(registration?.id, "example.personal");
  assert.deepEqual(registration?.credentials, {
    apiKey: credentialRef("env", "EXAMPLE_API_KEY"),
  });
  assert.equal(
    registration?.runtimeImplementation?.configurationDigest,
    provider.instance.configurationDigest,
  );
});

test("non-secret Provider configuration and credential references change instance identity", () => {
  const configured = (baseUrl: string, variable: string) => defineProviderPackage({
    module: { name: "example.provider", version: "1" },
    facet: "http-json",
    instance: "example.personal",
    implementation,
    configuration: { baseUrl },
    credentials: { apiKey: credentialRef("env", variable) },
    capabilities: [{
      lifecycle: "immediate",
      capability: capabilities.generation,
      returns: types.generated,
      handler: () => ({
        value: { kind: "inline", value: "generated" },
        conformance: "exact",
        delivery: "executed",
        metadata: {},
      }),
    }],
  }).instance.configurationDigest;
  assert.notEqual(configured("https://one.test", "KEY"), configured("https://two.test", "KEY"));
  assert.notEqual(configured("https://one.test", "KEY"), configured("https://one.test", "OTHER_KEY"));
});

test("wakeAfter turns Provider polling policy into an explicit Runtime wake hint", () => {
  assert.deepEqual(wakeAfter({ job: "123" }, 5_000, 10_000), {
    status: "pending",
    checkpoint: { job: "123" },
    wakeAt: 15_000,
  });
});
