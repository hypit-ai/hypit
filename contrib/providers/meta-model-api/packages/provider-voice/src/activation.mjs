import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-local/extension";
import { createMetaVoiceProvider, providerModule } from "./provider.mjs";

export default {
  format: "hypit.package@1",
  facets: [createRuntimeEndpointAdapterFacet({
    use: providerModule.name,
    activate(context) {
      const config = runtimeConfigObject(context.config, "Muse Voice");
      runtimeConfigExact(config, ["baseUrl", "apiKey", "model", "mode", "timeoutMs", "concurrency"], "Muse Voice");
      const apiKey = runtimeConfigCredentialRef(config.apiKey, "Muse Voice apiKey");
      if (!apiKey || !context.pool) throw new Error("Muse Voice requires apiKey and pool");
      const timeoutMs = runtimeConfigPositiveInteger(config.timeoutMs, "timeoutMs");
      return {
        endpoint: createMetaVoiceProvider({
          instance: context.instance,
          pool: context.pool,
          baseUrl: runtimeConfigString(config.baseUrl, "Muse Voice baseUrl") ?? "https://api.meta.ai/v1",
          model: runtimeConfigString(config.model, "Muse Voice model") ?? "muse-voice-transcribe-1.0",
          mode: runtimeConfigString(config.mode, "Muse Voice mode") ?? "ENDPOINTING",
          apiKey,
          concurrency: runtimeConfigPositiveInteger(config.concurrency, "concurrency") ?? 1,
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        }),
      };
    },
  })],
};
