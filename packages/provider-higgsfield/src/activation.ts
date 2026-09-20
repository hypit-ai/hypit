import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigActionLimits,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createHiggsfieldProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-higgsfield",
  activate(context) {
    if (context.pool === undefined) throw new Error("Higgsfield Provider Pool is required");
    const config = runtimeConfigObject(context.config, "Higgsfield");
    runtimeConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "Higgsfield");
    const baseUrl = runtimeConfigString(config.baseUrl, "Higgsfield baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("Higgsfield baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "Higgsfield apiKey");
    if (apiKey === undefined) throw new Error("Higgsfield apiKey CredentialRef is required");
    const actionLimits = runtimeConfigActionLimits(config.actionLimits);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "Higgsfield defaultConcurrency");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "Higgsfield pollIntervalMs");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "Higgsfield requestTimeoutMs");
    const operationTimeoutMs = runtimeConfigPositiveInteger(config.operationTimeoutMs, "Higgsfield operationTimeoutMs");
    return {
      endpoint: createHiggsfieldProvider({
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
