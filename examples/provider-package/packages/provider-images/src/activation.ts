import {
  createExecutionEnvironmentEndpointAdapterFacet, executionEnvironmentConfigCredentialRef, executionEnvironmentConfigExact,
  executionEnvironmentConfigObject, executionEnvironmentConfigPositiveInteger, executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";
import { createImageProvider, providerModule } from "./provider.js";

export default {
  facets: [createExecutionEnvironmentEndpointAdapterFacet({
    use: providerModule.name,
    activate(context) {
      const config = executionEnvironmentConfigObject(context.config, "Image service");
      executionEnvironmentConfigExact(config, ["baseUrl", "apiKey", "concurrency", "pollIntervalMs"], "Image service");
      const baseUrl = executionEnvironmentConfigString(config.baseUrl, "Image service baseUrl");
      const apiKey = executionEnvironmentConfigCredentialRef(config.apiKey, "Image service apiKey");
      if (!baseUrl || !apiKey || !context.pool) throw new Error("Image service requires baseUrl, apiKey and pool");
      return { endpoint: createImageProvider({
        instance: context.instance, pool: context.pool, baseUrl, apiKey,
        concurrency: executionEnvironmentConfigPositiveInteger(config.concurrency, "concurrency") ?? 1,
        pollIntervalMs: executionEnvironmentConfigPositiveInteger(config.pollIntervalMs, "pollIntervalMs") ?? 2_000,
      }) };
    },
  })],
};
