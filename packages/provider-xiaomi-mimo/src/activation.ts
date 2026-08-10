import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createXiaomiMimoProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-xiaomi-mimo",
  validate(context) {
    const config = runtimeConfigObject(context.config, "Xiaomi MiMo");
    runtimeConfigExact(config, [
      "apiBaseUrl", "apiKey", "defaultConcurrency", "requestTimeoutMs",
      "maxResponseBytes", "maxVoiceSampleBase64Bytes",
    ], "Xiaomi MiMo");
    const base = runtimeConfigString(config.apiBaseUrl, "Xiaomi MiMo apiBaseUrl");
    if (base !== undefined) {
      const url = new URL(base);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("Xiaomi MiMo apiBaseUrl must use HTTPS or loopback");
      }
    }
    if (runtimeConfigCredentialRef(config.apiKey, "Xiaomi MiMo apiKey") === undefined) {
      throw new Error("Xiaomi MiMo apiKey CredentialRef is required");
    }
    runtimeConfigPositiveInteger(config.defaultConcurrency, "Xiaomi MiMo defaultConcurrency");
    runtimeConfigPositiveInteger(config.requestTimeoutMs, "Xiaomi MiMo requestTimeoutMs");
    runtimeConfigPositiveInteger(config.maxResponseBytes, "Xiaomi MiMo maxResponseBytes");
    runtimeConfigPositiveInteger(config.maxVoiceSampleBase64Bytes, "Xiaomi MiMo maxVoiceSampleBase64Bytes");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "Xiaomi MiMo");
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "Xiaomi MiMo apiKey");
    if (apiKey === undefined) throw new Error("Xiaomi MiMo apiKey CredentialRef is required");
    return createXiaomiMimoProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(runtimeConfigString(config.apiBaseUrl, "Xiaomi MiMo apiBaseUrl") === undefined
        ? {} : { apiBaseUrl: config.apiBaseUrl as string }),
      apiKey,
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "Xiaomi MiMo defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(runtimeConfigPositiveInteger(config.requestTimeoutMs, "Xiaomi MiMo requestTimeoutMs") === undefined
        ? {} : { requestTimeoutMs: config.requestTimeoutMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxResponseBytes, "Xiaomi MiMo maxResponseBytes") === undefined
        ? {} : { maxResponseBytes: config.maxResponseBytes as number }),
      ...(runtimeConfigPositiveInteger(config.maxVoiceSampleBase64Bytes, "Xiaomi MiMo maxVoiceSampleBase64Bytes") === undefined
        ? {} : { maxVoiceSampleBase64Bytes: config.maxVoiceSampleBase64Bytes as number }),
    });
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-xiaomi-mimo",
  hostFacets: [adapter],
};

export default svmlPackage;
