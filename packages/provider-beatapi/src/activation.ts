import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigCredentialRef,
  executionEnvironmentConfigActionLimits,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";

import { createBeatApiProvider } from "./provider.js";

const adapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-beatapi",
  activate(context) {
    if (context.pool === undefined) throw new Error("BeatAPI Provider Pool is required");
    const config = executionEnvironmentConfigObject(context.config, "BeatAPI");
    executionEnvironmentConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "BeatAPI");
    const baseUrl = executionEnvironmentConfigString(config.baseUrl, "BeatAPI baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("BeatAPI baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = executionEnvironmentConfigCredentialRef(config.apiKey, "BeatAPI apiKey");
    if (apiKey === undefined) throw new Error("BeatAPI apiKey CredentialRef is required");
    const actionLimits = executionEnvironmentConfigActionLimits(config.actionLimits);
    const defaultConcurrency = executionEnvironmentConfigPositiveInteger(config.defaultConcurrency, "BeatAPI defaultConcurrency");
    const pollIntervalMs = executionEnvironmentConfigPositiveInteger(config.pollIntervalMs, "BeatAPI pollIntervalMs");
    const requestTimeoutMs = executionEnvironmentConfigPositiveInteger(config.requestTimeoutMs, "BeatAPI requestTimeoutMs");
    const operationTimeoutMs = executionEnvironmentConfigPositiveInteger(config.operationTimeoutMs, "BeatAPI operationTimeoutMs");
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
  facets: [adapter],
};

export default hypitPackage;
