import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createLocalWhisperXProvider } from "./provider.js";
import { localWhisperXService } from "./service.js";

const localWhisperXRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-whisperx-local",
  activate(context) {
    if (context.authority === undefined) throw new Error("WhisperX Provider Authority is required");
    const config = runtimeConfigObject(context.config, "local WhisperX");
    runtimeConfigExact(config, [
      "baseUrl", "expectedModel", "expectedDevice", "expectedCompute", "expectedBatchSize",
      "expectedServiceVersion", "expectedWhisperXVersion", "expectedPunktTabDigest",
      "defaultConcurrency", "requestTimeoutMs", "maxResponseBytes",
      "serviceCommand", "servicePrepareCommand",
    ], "local WhisperX");
    const baseUrl = runtimeConfigString(config.baseUrl, "WhisperX baseUrl");
    if (baseUrl !== undefined) {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "http:"
        || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
        throw new Error("local WhisperX Provider requires a loopback HTTP service");
      }
    }
    const expectedModel = runtimeConfigString(config.expectedModel, "WhisperX expectedModel");
    const expectedDevice = runtimeConfigString(config.expectedDevice, "WhisperX expectedDevice");
    const expectedCompute = runtimeConfigString(config.expectedCompute, "WhisperX expectedCompute");
    const expectedBatchSize = runtimeConfigPositiveInteger(config.expectedBatchSize, "WhisperX expectedBatchSize");
    const expectedServiceVersion = runtimeConfigString(config.expectedServiceVersion, "WhisperX expectedServiceVersion");
    const expectedWhisperXVersion = runtimeConfigString(config.expectedWhisperXVersion, "WhisperX expectedWhisperXVersion");
    const expectedPunktTabDigest = runtimeConfigString(config.expectedPunktTabDigest, "WhisperX expectedPunktTabDigest");
    if (expectedPunktTabDigest !== undefined && !/^[0-9a-f]{64}$/u.test(expectedPunktTabDigest)) {
      throw new Error("WhisperX expectedPunktTabDigest is invalid");
    }
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "WhisperX defaultConcurrency");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "WhisperX requestTimeoutMs");
    const maxResponseBytes = runtimeConfigPositiveInteger(config.maxResponseBytes, "WhisperX maxResponseBytes");
    for (const key of ["serviceCommand", "servicePrepareCommand"] as const) {
      const value = config[key];
      if (value !== undefined
        && (!Array.isArray(value) || value.length === 0
          || value.some((item) => typeof item !== "string" || item.length === 0))) {
        throw new Error(`WhisperX ${key} must be a non-empty array of non-empty strings`);
      }
    }
    return {
      endpoint: createLocalWhisperXProvider({
        instance: context.instance,
        authority: context.authority,
        ...(baseUrl === undefined ? {} : { baseUrl }),
        ...(expectedModel === undefined ? {} : { expectedModel }),
        ...(expectedDevice === undefined ? {} : { expectedDevice }),
        ...(expectedCompute === undefined ? {} : { expectedCompute }),
        ...(expectedBatchSize === undefined ? {} : { expectedBatchSize }),
        ...(expectedServiceVersion === undefined ? {} : { expectedServiceVersion }),
        ...(expectedWhisperXVersion === undefined ? {} : { expectedWhisperXVersion }),
        ...(expectedPunktTabDigest === undefined ? {} : { expectedPunktTabDigest }),
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
      }),
      externalService: localWhisperXService(context),
    };
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-whisperx-local",
  hostFacets: [localWhisperXRuntimeAdapter],
};

export default svmlPackage;
