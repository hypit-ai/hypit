import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigBoolean,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-local/extension";
import { createSamMatteProvider, providerModule } from "./provider.mjs";

export default {
  format: "hypit.package@1",
  facets: [createRuntimeEndpointAdapterFacet({
    use: providerModule.name,
    activate(context) {
      const config = runtimeConfigObject(context.config, "SAM cutout");
      runtimeConfigExact(config, ["baseUrl", "apiKey", "model", "concept", "timeoutMs", "concurrency", "compatibilityCopy"], "SAM cutout");
      const apiKey = runtimeConfigCredentialRef(config.apiKey, "SAM cutout apiKey");
      if (!apiKey || !context.pool) throw new Error("SAM cutout requires apiKey and pool");
      return {
        endpoint: createSamMatteProvider({
          instance: context.instance,
          pool: context.pool,
          baseUrl: runtimeConfigString(config.baseUrl, "SAM cutout baseUrl") ?? "https://api.meta.ai/v1",
          model: runtimeConfigString(config.model, "SAM cutout model") ?? "sam-3.1",
          concept: runtimeConfigString(config.concept, "SAM cutout concept") ?? "person",
          compatibilityCopy: runtimeConfigBoolean(config.compatibilityCopy, "SAM cutout compatibilityCopy") ?? false,
          apiKey,
          concurrency: runtimeConfigPositiveInteger(config.concurrency, "concurrency") ?? 1,
          ...(runtimeConfigPositiveInteger(config.timeoutMs, "timeoutMs") === undefined
            ? {} : { timeoutMs: runtimeConfigPositiveInteger(config.timeoutMs, "timeoutMs") }),
        }),
      };
    },
  })],
};
