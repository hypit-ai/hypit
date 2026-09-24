import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigActionLimits,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createMuApiProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-muapi",
  activate(context) {
    if (context.pool === undefined) throw new Error("MuAPI Provider Pool is required");
    const config = runtimeConfigObject(context.config, "MuAPI");
    runtimeConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "MuAPI");
    const baseUrl = runtimeConfigString(config.baseUrl, "MuAPI baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("MuAPI baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "MuAPI apiKey");
    if (apiKey === undefined) throw new Error("MuAPI apiKey CredentialRef is required");
    const actionLimits = runtimeConfigActionLimits(config.actionLimits);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "MuAPI defaultConcurrency");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "MuAPI pollIntervalMs");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "MuAPI requestTimeoutMs");
    const operationTimeoutMs = runtimeConfigPositiveInteger(config.operationTimeoutMs, "MuAPI operationTimeoutMs");
    return {
      endpoint: createMuApiProvider({
        instance: context.instance,
        pool: context.pool,
        ...(baseUrl === undefined ? {} : { baseUrl }),
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(actionLimits === undefined ? {} : { actionLimits }),
        ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(operationTimeoutMs === undefined ? {} : { operationTimeoutMs }),
      }),
    };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [adapter],
};

export default hypitPackage;
