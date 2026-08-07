import assert from "node:assert/strict";
import test from "node:test";

import {
  defineEndpointPackage,
  wakeAfter,
} from "@svml/endpoint-kit";
import type {
  EndpointRegistrar,
  EndpointRegistrationOptions,
  ImmediateEndpointHandler,
  RecoverableEndpoint,
} from "@svml/endpoint-kit";
import type { CapabilityRef, TypeRef } from "@svml/protocol";
import { digestOf } from "@svml/protocol";
import { credentialRef } from "@svml/runtime";

import { capabilities, types } from "../../core/test/greeting-fixture.js";

const implementation = {
  locator: "example.provider/http-json",
  digest: digestOf("example.provider/http-json@1"),
} as const;

type CapturedRegistration = {
  readonly id: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly kind: "immediate" | "recoverable";
  readonly options: EndpointRegistrationOptions;
};

function capturingRegistrar(registrations: CapturedRegistration[]): EndpointRegistrar {
  return {
    registerImmediateEndpoint(id, capability, returns, _handler: ImmediateEndpointHandler, options = {}) {
      registrations.push({ id, capability, returns, kind: "immediate", options });
    },
    registerRecoverableEndpoint(id, capability, returns, _endpoint: RecoverableEndpoint, options = {}) {
      registrations.push({ id, capability, returns, kind: "recoverable", options });
    },
  };
}

test("one Endpoint definition generates Manifest, instance, bindings and host-neutral registration", async () => {
  const endpoint = defineEndpointPackage({
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
  assert.equal(endpoint.manifest.facets[0]?.role, "capability-endpoint");
  assert.equal(endpoint.manifest.facets[0]?.defaultConcurrency, 3);
  assert.deepEqual(endpoint.manifest.facets[0]?.credentialSlots, ["apiKey"]);
  assert.equal(endpoint.instance.id, "example.personal");
  assert.deepEqual(endpoint.bindings, [{
    capability: capabilities.generation,
    returns: types.generated,
    endpoint: "example.personal",
  }]);

  const registrations: CapturedRegistration[] = [];
  await endpoint.install(capturingRegistrar(registrations));
  assert.equal(registrations[0]?.id, "example.personal");
  assert.equal(registrations[0]?.kind, "immediate");
  assert.deepEqual(registrations[0]?.options.credentials, {
    apiKey: credentialRef("env", "EXAMPLE_API_KEY"),
  });
  assert.equal(
    registrations[0]?.options.runtimeImplementation?.configurationDigest,
    endpoint.instance.configurationDigest,
  );
});

test("non-secret Endpoint configuration and credential references change instance identity", () => {
  const configured = (baseUrl: string, variable: string) => defineEndpointPackage({
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

test("wakeAfter turns polling policy into an explicit Runtime wake hint", () => {
  assert.deepEqual(wakeAfter({ job: "123" }, 5_000, 10_000), {
    status: "pending",
    checkpoint: { job: "123" },
    wakeAt: 15_000,
  });
});
