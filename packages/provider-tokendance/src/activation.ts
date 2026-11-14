import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigCredentialRef,
  executionEnvironmentConfigActionLimits,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";

import { createTokenDanceProvider } from "./provider.js";

const adapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-tokendance",
  activate(context) {
    if (context.pool === undefined) throw new Error("TokenDance Provider Pool is required");
    const config = executionEnvironmentConfigObject(context.config, "TokenDance");
    executionEnvironmentConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "TokenDance");
    const baseUrl = executionEnvironmentConfigString(config.baseUrl, "TokenDance baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("TokenDance baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = executionEnvironmentConfigCredentialRef(config.apiKey, "TokenDance apiKey");
    if (apiKey === undefined) throw new Error("TokenDance apiKey CredentialRef is required");
    const actionLimits = executionEnvironmentConfigActionLimits(config.actionLimits);
    const defaultConcurrency = executionEnvironmentConfigPositiveInteger(config.defaultConcurrency, "TokenDance defaultConcurrency");
    const pollIntervalMs = executionEnvironmentConfigPositiveInteger(config.pollIntervalMs, "TokenDance pollIntervalMs");
    const requestTimeoutMs = executionEnvironmentConfigPositiveInteger(config.requestTimeoutMs, "TokenDance requestTimeoutMs");
    const operationTimeoutMs = executionEnvironmentConfigPositiveInteger(config.operationTimeoutMs, "TokenDance operationTimeoutMs");
    return {
      endpoint: createTokenDanceProvider({
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
