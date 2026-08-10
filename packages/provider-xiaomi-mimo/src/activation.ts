import { credentialRef } from "@narratage/runtime";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import { diagnoseRuntimeEnvironmentCredential } from "@narratage/runtime-adapter-node";

import { createXiaomiMimoProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-xiaomi-mimo",
  validate(context) {
    const config = runtimeConfigObject(context.config, "Xiaomi MiMo");
    runtimeConfigExact(config, [
      "apiBaseUrl", "apiKeyEnv", "defaultConcurrency", "requestTimeoutMs",
      "maxResponseBytes", "maxVoiceSampleBase64Bytes",
    ], "Xiaomi MiMo");
    const base = runtimeConfigString(config.apiBaseUrl, "Xiaomi MiMo apiBaseUrl");
    if (base !== undefined) {
      const url = new URL(base);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("Xiaomi MiMo apiBaseUrl must use HTTPS or loopback");
      }
    }
    runtimeConfigString(config.apiKeyEnv, "Xiaomi MiMo apiKeyEnv");
    runtimeConfigPositiveInteger(config.defaultConcurrency, "Xiaomi MiMo defaultConcurrency");
    runtimeConfigPositiveInteger(config.requestTimeoutMs, "Xiaomi MiMo requestTimeoutMs");
    runtimeConfigPositiveInteger(config.maxResponseBytes, "Xiaomi MiMo maxResponseBytes");
    runtimeConfigPositiveInteger(config.maxVoiceSampleBase64Bytes, "Xiaomi MiMo maxVoiceSampleBase64Bytes");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "Xiaomi MiMo");
    const apiKeyEnv = runtimeConfigString(config.apiKeyEnv, "Xiaomi MiMo apiKeyEnv");
    return createXiaomiMimoProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(runtimeConfigString(config.apiBaseUrl, "Xiaomi MiMo apiBaseUrl") === undefined
        ? {} : { apiBaseUrl: config.apiBaseUrl as string }),
      ...(apiKeyEnv === undefined ? {} : { apiKey: credentialRef("env", apiKeyEnv) }),
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
  doctor(context) {
    const config = runtimeConfigObject(context.config, "Xiaomi MiMo");
    return diagnoseRuntimeEnvironmentCredential(
      runtimeConfigString(config.apiKeyEnv, "Xiaomi MiMo apiKeyEnv") ?? "MIMO_API_KEY",
      "Xiaomi MiMo",
    );
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-xiaomi-mimo",
  hostFacets: [adapter],
};

export default svmlPackage;
