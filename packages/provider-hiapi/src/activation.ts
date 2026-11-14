import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigCredentialRef,
  executionEnvironmentConfigActionLimits,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";

import { createHiApiProvider } from "./provider.js";

const adapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-hiapi",
  activate(context) {
    if (context.pool === undefined) throw new Error("HiAPI Provider Pool is required");
    const config = executionEnvironmentConfigObject(context.config, "HiAPI");
    executionEnvironmentConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "HiAPI");
    const baseUrl = executionEnvironmentConfigString(config.baseUrl, "HiAPI baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("HiAPI baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = executionEnvironmentConfigCredentialRef(config.apiKey, "HiAPI apiKey");
    if (apiKey === undefined) throw new Error("HiAPI apiKey CredentialRef is required");
    const actionLimits = executionEnvironmentConfigActionLimits(config.actionLimits);
    const defaultConcurrency = executionEnvironmentConfigPositiveInteger(config.defaultConcurrency, "HiAPI defaultConcurrency");
    const pollIntervalMs = executionEnvironmentConfigPositiveInteger(config.pollIntervalMs, "HiAPI pollIntervalMs");
    const requestTimeoutMs = executionEnvironmentConfigPositiveInteger(config.requestTimeoutMs, "HiAPI requestTimeoutMs");
    const operationTimeoutMs = executionEnvironmentConfigPositiveInteger(config.operationTimeoutMs, "HiAPI operationTimeoutMs");
    return {
      endpoint: createHiApiProvider({
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
