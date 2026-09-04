import assert from "node:assert/strict";
import test from "node:test";

import {
  defineEndpointPackage,
  wakeAfter,
} from "@hypit/endpoint-kit";
import type {
  EndpointRegistrar,
  EndpointRegistrationOptions,
  ImmediateEndpointHandler,
  AsyncEndpoint,
} from "@hypit/endpoint-kit";
import type { CapabilityRef, TypeRef } from "@hypit/protocol";
import { credentialRef } from "@hypit/runtime";

import { capabilities, types } from "../../core/test/greeting-fixture.js";

type CapturedRegistration = {
  readonly id: string;
  readonly capability: CapabilityRef;
  readonly returns: TypeRef;
  readonly kind: "immediate" | "asynchronous";
  readonly options: EndpointRegistrationOptions;
};

function capturingRegistrar(registrations: CapturedRegistration[]): EndpointRegistrar {
  return {
    registerImmediateEndpoint(id, capability, returns, _handler: ImmediateEndpointHandler, options = {}) {
      registrations.push({ id, capability, returns, kind: "immediate", options });
    },
    registerAsyncEndpoint(id, capability, returns, _endpoint: AsyncEndpoint, options = {}) {
      registrations.push({ id, capability, returns, kind: "asynchronous", options });
    },
  };
}

test("one Endpoint definition generates one configured instance and host-neutral registration", async () => {
  const endpoint = defineEndpointPackage({
    module: { name: "example.provider", version: "1" },
    facet: "http-json",
    instance: "example.personal",
    pool: "example.personal",
    credentials: { apiKey: credentialRef("env", "EXAMPLE_API_KEY") },
    defaultConcurrency: 3,
    capabilities: [{
      lifecycle: "immediate",
      transient: true,
      capability: capabilities.generation,
      returns: types.generated,
      capacity: "text-generation",
      maxConcurrency: 1,
      handler: () => ({
        value: { kind: "inline", value: "generated" },
      }),
    }],
  });
  assert.equal(endpoint.instance.id, "example.personal");
  assert.equal(endpoint.instance.pool, "example.personal");
  assert.deepEqual(endpoint.offers, [{
    capability: capabilities.generation,
    returns: types.generated,
    endpoint: "example.personal",
    transient: true,
  }]);

  const registrations: CapturedRegistration[] = [];
  await endpoint.install(capturingRegistrar(registrations));
  assert.equal(registrations[0]?.id, "example.personal");
  assert.equal(registrations[0]?.kind, "immediate");
  assert.deepEqual(registrations[0]?.options.credentials, {
    apiKey: credentialRef("env", "EXAMPLE_API_KEY"),
  });
  assert.equal(registrations[0]?.options.transient, true);
  assert.deepEqual(registrations[0]?.options.scheduling, {
    resources: [
      { id: "pool:example.personal", limit: 3 },
      { id: "capacity:example.personal/text-generation", limit: 1 },
    ],
  });
});

test("an asynchronous Endpoint cannot opt into disposable execution", () => {
  assert.throws(() => defineEndpointPackage({
    module: { name: "example.provider", version: "1" },
    facet: "remote",
    instance: "example.remote",
    pool: "example.remote",
    capabilities: [{
      lifecycle: "asynchronous",
      transient: true,
      capability: capabilities.generation,
      returns: types.generated,
      endpoint: {
        start: () => ({ status: "failed", failure: { code: "unused", message: "unused" } }),
        poll: () => ({ status: "failed", failure: { code: "unused", message: "unused" } }),
      },
    }],
  }), /cannot be transient and asynchronous/u);
});

test("wakeAfter turns polling policy into an explicit Runtime wake hint", () => {
  assert.deepEqual(wakeAfter({ job: "123" }, 5_000, 10_000), {
    status: "pending",
    handle: { job: "123" },
    wakeAt: 15_000,
  });
});
