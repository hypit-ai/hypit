import type { EndpointSupport } from "@hypit/endpoint";

export function endpointSupport(reason: string | undefined): EndpointSupport {
  return reason === undefined ? { status: "supported" } : { status: "unsupported", reason };
}
