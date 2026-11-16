import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-local/extension";
import { createMetaImageProvider, providerModule } from "./provider.mjs";

export default {
  format: "hypit.package@1",
  facets: [createRuntimeEndpointAdapterFacet({
    use: providerModule.name,
    activate(context) {
      const config = runtimeConfigObject(context.config, "Muse Image");
      runtimeConfigExact(config, ["baseUrl", "apiKey", "model", "timeoutMs", "concurrency"], "Muse Image");
      const apiKey = runtimeConfigCredentialRef(config.apiKey, "Muse Image apiKey");
      if (!apiKey || !context.pool) throw new Error("Muse Image requires apiKey and pool");
      return {
        endpoint: createMetaImageProvider({
          instance: context.instance,
          pool: context.pool,
          baseUrl: runtimeConfigString(config.baseUrl, "Muse Image baseUrl") ?? "https://api.meta.ai/v1",
          model: runtimeConfigString(config.model, "Muse Image model") ?? "muse-image-1.0",
          apiKey,
          concurrency: runtimeConfigPositiveInteger(config.concurrency, "concurrency") ?? 2,
          ...(runtimeConfigPositiveInteger(config.timeoutMs, "timeoutMs") === undefined
            ? {} : { timeoutMs: runtimeConfigPositiveInteger(config.timeoutMs, "timeoutMs") }),
        }),
      };
    },
  })],
};
