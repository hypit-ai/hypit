import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigCredentialRef,
  executionEnvironmentConfigActionLimits,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";

import { createMonidProvider } from "./provider.js";

const adapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-monid",
  activate(context) {
    if (context.pool === undefined) throw new Error("Monid Provider Pool is required");
    const config = executionEnvironmentConfigObject(context.config, "Monid");
    executionEnvironmentConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "pollIntervalMs",
      "requestTimeoutMs",
      "operationTimeoutMs",
    ], "Monid");
    const baseUrl = executionEnvironmentConfigString(config.baseUrl, "Monid baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("Monid baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = executionEnvironmentConfigCredentialRef(config.apiKey, "Monid apiKey");
    if (apiKey === undefined) throw new Error("Monid apiKey CredentialRef is required");
    const actionLimits = executionEnvironmentConfigActionLimits(config.actionLimits);
    const defaultConcurrency = executionEnvironmentConfigPositiveInteger(config.defaultConcurrency, "Monid defaultConcurrency");
    const pollIntervalMs = executionEnvironmentConfigPositiveInteger(config.pollIntervalMs, "Monid pollIntervalMs");
    const requestTimeoutMs = executionEnvironmentConfigPositiveInteger(config.requestTimeoutMs, "Monid requestTimeoutMs");
    const operationTimeoutMs = executionEnvironmentConfigPositiveInteger(config.operationTimeoutMs, "Monid operationTimeoutMs");
    return {
      endpoint: createMonidProvider({
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
