import {
  createExecutionEnvironmentEndpointAdapterFacet, executionEnvironmentConfigCredentialRef, executionEnvironmentConfigExact,
  executionEnvironmentConfigObject, executionEnvironmentConfigPositiveInteger, executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import { createVideoProvider, providerModule } from "./provider.js";

export default {
  facets: [createExecutionEnvironmentEndpointAdapterFacet({
    use: providerModule.name,
    activate(context) {
      const config = executionEnvironmentConfigObject(context.config, "Video service");
      executionEnvironmentConfigExact(config, ["baseUrl", "apiKey", "concurrency", "pollIntervalMs"], "Video service");
      const baseUrl = executionEnvironmentConfigString(config.baseUrl, "Video service baseUrl");
      const apiKey = executionEnvironmentConfigCredentialRef(config.apiKey, "Video service apiKey");
      if (!baseUrl || !apiKey || !context.pool) throw new Error("Video service requires baseUrl, apiKey and pool");
      return { endpoint: createVideoProvider({
        instance: context.instance, pool: context.pool, baseUrl, apiKey,
        concurrency: executionEnvironmentConfigPositiveInteger(config.concurrency, "concurrency") ?? 1,
        pollIntervalMs: executionEnvironmentConfigPositiveInteger(config.pollIntervalMs, "pollIntervalMs") ?? 5_000,
      }) };
    },
  })],
};
