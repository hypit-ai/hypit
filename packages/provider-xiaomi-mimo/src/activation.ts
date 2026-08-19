import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createXiaomiMimoProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-xiaomi-mimo",
  activate(context) {
    if (context.pool === undefined) throw new Error("Xiaomi MiMo Provider Pool is required");
    const config = runtimeConfigObject(context.config, "Xiaomi MiMo");
    runtimeConfigExact(config, [
      "apiBaseUrl", "apiKey", "defaultConcurrency", "requestTimeoutMs",
      "maxResponseBytes", "maxVoiceSampleBase64Bytes",
    ], "Xiaomi MiMo");
    const apiBaseUrl = runtimeConfigString(config.apiBaseUrl, "Xiaomi MiMo apiBaseUrl");
    if (apiBaseUrl !== undefined) {
      const url = new URL(apiBaseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("Xiaomi MiMo apiBaseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "Xiaomi MiMo apiKey");
    if (apiKey === undefined) throw new Error("Xiaomi MiMo apiKey CredentialRef is required");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "Xiaomi MiMo defaultConcurrency");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "Xiaomi MiMo requestTimeoutMs");
    const maxResponseBytes = runtimeConfigPositiveInteger(config.maxResponseBytes, "Xiaomi MiMo maxResponseBytes");
    const maxVoiceSampleBase64Bytes = runtimeConfigPositiveInteger(
      config.maxVoiceSampleBase64Bytes,
      "Xiaomi MiMo maxVoiceSampleBase64Bytes",
    );
    return {
      endpoint: createXiaomiMimoProvider({
        instance: context.instance,
        pool: context.pool,
        ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
        ...(maxVoiceSampleBase64Bytes === undefined ? {} : { maxVoiceSampleBase64Bytes }),
      }),
    };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [adapter],
};

export default hypitPackage;
