import assert from "node:assert/strict";
import test from "node:test";

import {
  defineEndpointPackage,
  wakeAfter,
} from "@narratage/endpoint-kit";
import type {
  EndpointRegistrar,
  EndpointRegistrationOptions,
  ImmediateEndpointHandler,
  RecoverableEndpoint,
} from "@narratage/endpoint-kit";
import type { CapabilityRef, TypeRef } from "@narratage/protocol";
import { digestOf } from "@narratage/protocol";
import { credentialRef } from "@narratage/runtime";

import { capabilities, types } from "../../core/test/greeting-fixture.js";

const implementation = {
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

test("one Endpoint definition generates Manifest, instance, offers and host-neutral registration", async () => {
  const endpoint = defineEndpointPackage({
    module: { name: "example.provider", version: "1" },
    facet: "http-json",
    instance: "example.personal",
    pool: "example.personal",
    credentials: { apiKey: credentialRef("env", "EXAMPLE_API_KEY") },
    defaultConcurrency: 3,
    capabilities: [{
      lifecycle: "immediate",
      capability: capabilities.generation,
      returns: types.generated,
      lane: "text-generation",
      maxConcurrency: 1,
      handler: () => ({
        value: { kind: "inline", value: "generated" },
      }),
    }],
  });
  assert.equal(endpoint.manifest.facets[0]?.role, "capability-endpoint");
  assert.equal(endpoint.manifest.facets[0]?.defaultConcurrency, 3);
  assert.deepEqual(endpoint.manifest.facets[0]?.credentialSlots, ["apiKey"]);
  assert.equal(endpoint.instance.id, "example.personal");
  assert.deepEqual(endpoint.offers, [{
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
  assert.deepEqual(registrations[0]?.options.scheduling, {
    queue: { pool: "example.personal", lane: "text-generation" },
    resources: [
      { id: "pool:example.personal", maxActive: 3, maxInFlight: 3 },
      { id: "lane:example.personal/text-generation", maxActive: 1, maxInFlight: 1 },
    ],
  });
});

test("wakeAfter turns polling policy into an explicit Runtime wake hint", () => {
  assert.deepEqual(wakeAfter({ job: "123" }, 5_000, 10_000), {
    status: "pending",
    checkpoint: { job: "123" },
    wakeAt: 15_000,
  });
});
