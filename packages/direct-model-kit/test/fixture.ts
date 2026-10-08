import type {
  EndpointRegistrar,
  EndpointInvocationContext,
  AsyncEndpoint,
  ImmediateEndpointHandler,
  EndpointRegistrationOptions,
} from "@hypit/endpoint-kit";
import type {
  CapabilityRef,
  TypeRef,
  CanonicalValue,
  BlobRef,
} from "@hypit/protocol";
import { MemoryResourceStore } from "@hypit/driver-node";
export type Registered = {
  capability: CapabilityRef;
  returns: TypeRef;
  async?: AsyncEndpoint;
  handler?: ImmediateEndpointHandler;
  options: EndpointRegistrationOptions;
};
export async function registrations(provider: {
  install: (r: EndpointRegistrar) => unknown;
}) {
  const result: Registered[] = [];
  await provider.install({
    registerImmediateEndpoint(_id, capability, returns, handler, options = {}) {
      result.push({ capability, returns, handler, options });
    },
    registerAsyncEndpoint(_id, capability, returns, endpoint, options = {}) {
      result.push({ capability, returns, async: endpoint, options });
    },
  });
  return result;
}
export const image: BlobRef = {
  kind: "blob",
  resource: "res_test",
  size: 3,
  mediaType: "image/png",
};
export const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export function context(r: Registered, ports: unknown) {
  return {
    need: {
      capability: r.capability,
      returns: r.returns,
      constraints: { ports } as CanonicalValue,
    },
    credentials: { apiKey: { secret: "unit-test-key" } },
    resources: new MemoryResourceStore(),
  } as unknown as EndpointInvocationContext;
}
export const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
