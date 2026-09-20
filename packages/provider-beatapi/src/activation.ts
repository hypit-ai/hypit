import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigActionLimits,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createBeatApiProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-beatapi",
  activate(context) {
    if (context.pool === undefined) throw new Error("BeatAPI Provider Pool is required");
    const config = runtimeConfigObject(context.config, "BeatAPI");
    runtimeConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "BeatAPI");
    const baseUrl = runtimeConfigString(config.baseUrl, "BeatAPI baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("BeatAPI baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "BeatAPI apiKey");
    if (apiKey === undefined) throw new Error("BeatAPI apiKey CredentialRef is required");
    const actionLimits = runtimeConfigActionLimits(config.actionLimits);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "BeatAPI defaultConcurrency");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "BeatAPI pollIntervalMs");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "BeatAPI requestTimeoutMs");
    const operationTimeoutMs = runtimeConfigPositiveInteger(config.operationTimeoutMs, "BeatAPI operationTimeoutMs");
    return {
      endpoint: createBeatApiProvider({
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
