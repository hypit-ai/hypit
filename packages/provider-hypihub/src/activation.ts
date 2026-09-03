import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigBoolean,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createHypiHubProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-hypihub",
  activate(context) {
    if (context.pool === undefined) throw new Error("HypiHub Provider Pool is required");
    const config = runtimeConfigObject(context.config, "HypiHub");
    runtimeConfigExact(config, ["baseUrl", "apiKey", "defaultConcurrency", "pollIntervalMs", "requestTimeoutMs", "audio", "whisperxModel"], "HypiHub");
    const baseUrl = runtimeConfigString(config.baseUrl, "HypiHub baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("HypiHub baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "HypiHub apiKey");
    if (apiKey === undefined) throw new Error("HypiHub apiKey CredentialRef is required");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "HypiHub defaultConcurrency");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "HypiHub pollIntervalMs");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "HypiHub requestTimeoutMs");
    const audio = runtimeConfigBoolean(config.audio, "HypiHub audio");
    const whisperxModel = runtimeConfigString(config.whisperxModel, "HypiHub whisperxModel");
    return {
      endpoint: createHypiHubProvider({
        instance: context.instance,
        pool: context.pool,
        ...(baseUrl === undefined ? {} : { baseUrl }),
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(audio === undefined ? {} : { audio }),
        ...(whisperxModel === undefined ? {} : { whisperxModel }),
      }),
    };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [adapter],
};

export default hypitPackage;
