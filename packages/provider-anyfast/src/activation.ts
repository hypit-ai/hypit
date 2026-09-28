import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigActionLimits,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createAnyFastProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-anyfast",
  activate(context) {
    if (context.pool === undefined) throw new Error("AnyFast Provider Pool is required");
    const config = runtimeConfigObject(context.config, "AnyFast");
    runtimeConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "AnyFast");
    const baseUrl = runtimeConfigString(config.baseUrl, "AnyFast baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
        throw new Error("AnyFast baseUrl must use HTTPS or loopback");
      }
      if (url.pathname !== "" && url.pathname !== "/" && url.pathname !== "/v1") {
        throw new Error("AnyFast baseUrl must be the service host or end in /v1");
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "AnyFast apiKey");
    if (apiKey === undefined) throw new Error("AnyFast apiKey CredentialRef is required");
    const actionLimits = runtimeConfigActionLimits(config.actionLimits);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "AnyFast defaultConcurrency");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "AnyFast pollIntervalMs");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "AnyFast requestTimeoutMs");
    const operationTimeoutMs = runtimeConfigPositiveInteger(config.operationTimeoutMs, "AnyFast operationTimeoutMs");
    return {
      endpoint: createAnyFastProvider({
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
