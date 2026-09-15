import {
  createRuntimeEndpointAdapterFacet, runtimeConfigCredentialRef, runtimeConfigExact,
  runtimeConfigObject, runtimeConfigPositiveInteger, runtimeConfigString,
} from "@hypit/hypit/runtime-kit";
import { createWanxProvider, providerModule } from "./provider.js";

export default {
  format: "hypit.node-package@1" as const,
  hostFacets: [createRuntimeEndpointAdapterFacet({
    use: providerModule.name,
    activate(context) {
      const config = runtimeConfigObject(context.config, "Wanx video service");
      runtimeConfigExact(config, ["baseUrl", "apiKey", "model", "concurrency", "pollIntervalMs"], "Wanx video service");
      const baseUrl = runtimeConfigString(config.baseUrl, "Wanx baseUrl") ?? "https://dashscope.aliyuncs.com";
      const apiKey = runtimeConfigCredentialRef(config.apiKey, "Wanx apiKey");
      const model = runtimeConfigString(config.model, "Wanx model") ?? "wan3.0-video";
      if (!apiKey || !context.pool) throw new Error("Wanx video service requires apiKey and pool");
      return {
        endpoint: createWanxProvider({
          instance: context.instance,
          pool: context.pool,
          baseUrl,
          apiKey,
          model,
          concurrency: runtimeConfigPositiveInteger(config.concurrency, "concurrency") ?? 1,
          pollIntervalMs: runtimeConfigPositiveInteger(config.pollIntervalMs, "pollIntervalMs") ?? 5_000,
        }),
      };
    },
  })],
};
