import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createVertexProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-vertex",
  activate(context) {
    if (context.pool === undefined) throw new Error("Vertex Provider Pool is required");
    const config = runtimeConfigObject(context.config, "Vertex");
    runtimeConfigExact(config, ["project", "credentials", "location", "defaultConcurrency", "requestTimeoutMs"], "Vertex");
    const project = runtimeConfigCredentialRef(config.project, "Vertex project");
    if (project === undefined) throw new Error("Vertex project CredentialRef is required");
    const credentials = runtimeConfigCredentialRef(config.credentials, "Vertex credentials");
    if (credentials === undefined) throw new Error("Vertex credentials CredentialRef is required");
    const location = runtimeConfigString(config.location, "Vertex location");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "Vertex defaultConcurrency");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "Vertex requestTimeoutMs");
    return { endpoint: createVertexProvider({
      instance: context.instance,
      pool: context.pool,
      project,
      credentials,
      ...(location === undefined ? {} : { location }),
      ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
      ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
    }) };
  },
});

export const hypitPackage = { format: "hypit.node-package@1" as const, hostFacets: [adapter] };
export default hypitPackage;
