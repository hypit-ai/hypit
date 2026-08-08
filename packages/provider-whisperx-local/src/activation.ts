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
  validate(context) {
    const config = runtimeConfigObject(context.config, "local WhisperX");
    runtimeConfigExact(config, [
      "baseUrl", "expectedModel", "expectedDevice", "expectedCompute", "expectedBatchSize",
      "expectedServiceVersion", "expectedWhisperXVersion", "expectedPunktTabDigest",
      "defaultConcurrency", "requestTimeoutMs", "maxResponseBytes",
      "serviceCommand", "servicePrepareCommand",
    ], "local WhisperX");
    const baseUrlValue = runtimeConfigString(config.baseUrl, "WhisperX baseUrl");
    if (baseUrlValue !== undefined) {
      const baseUrl = new URL(baseUrlValue);
      if (baseUrl.protocol !== "http:"
        || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseUrl.hostname)) {
        throw new Error("local WhisperX Provider requires a loopback HTTP service");
      }
    }
    runtimeConfigString(config.expectedModel, "WhisperX expectedModel");
    runtimeConfigString(config.expectedDevice, "WhisperX expectedDevice");
    runtimeConfigString(config.expectedCompute, "WhisperX expectedCompute");
    runtimeConfigPositiveInteger(config.expectedBatchSize, "WhisperX expectedBatchSize");
    runtimeConfigString(config.expectedServiceVersion, "WhisperX expectedServiceVersion");
    runtimeConfigString(config.expectedWhisperXVersion, "WhisperX expectedWhisperXVersion");
    const punkt = runtimeConfigString(config.expectedPunktTabDigest, "WhisperX expectedPunktTabDigest");
    if (punkt !== undefined && !/^[0-9a-f]{64}$/u.test(punkt)) {
      throw new Error("WhisperX expectedPunktTabDigest is invalid");
    }
    runtimeConfigPositiveInteger(config.defaultConcurrency, "WhisperX defaultConcurrency");
    runtimeConfigPositiveInteger(config.requestTimeoutMs, "WhisperX requestTimeoutMs");
    runtimeConfigPositiveInteger(config.maxResponseBytes, "WhisperX maxResponseBytes");
    for (const key of ["serviceCommand", "servicePrepareCommand"] as const) {
      const value = config[key];
      if (value !== undefined
        && (!Array.isArray(value) || value.length === 0
          || value.some((item) => typeof item !== "string" || item.length === 0))) {
        throw new Error(`WhisperX ${key} must be a non-empty array of non-empty strings`);
      }
    }
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "local WhisperX");
    runtimeConfigExact(config, [
      "baseUrl", "expectedModel", "expectedDevice", "expectedCompute", "expectedBatchSize",
      "expectedServiceVersion", "expectedWhisperXVersion", "expectedPunktTabDigest",
      "defaultConcurrency", "requestTimeoutMs", "maxResponseBytes",
      "serviceCommand", "servicePrepareCommand",
    ], "local WhisperX");
    return createLocalWhisperXProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(runtimeConfigString(config.baseUrl, "WhisperX baseUrl") === undefined
        ? {} : { baseUrl: config.baseUrl as string }),
      ...(runtimeConfigString(config.expectedModel, "WhisperX expectedModel") === undefined
        ? {} : { expectedModel: config.expectedModel as string }),
      ...(runtimeConfigString(config.expectedDevice, "WhisperX expectedDevice") === undefined
        ? {} : { expectedDevice: config.expectedDevice as string }),
      ...(runtimeConfigString(config.expectedCompute, "WhisperX expectedCompute") === undefined
        ? {} : { expectedCompute: config.expectedCompute as string }),
      ...(runtimeConfigPositiveInteger(config.expectedBatchSize, "WhisperX expectedBatchSize") === undefined
        ? {} : { expectedBatchSize: config.expectedBatchSize as number }),
      ...(runtimeConfigString(config.expectedServiceVersion, "WhisperX expectedServiceVersion") === undefined
        ? {} : { expectedServiceVersion: config.expectedServiceVersion as string }),
      ...(runtimeConfigString(config.expectedWhisperXVersion, "WhisperX expectedWhisperXVersion") === undefined
        ? {} : { expectedWhisperXVersion: config.expectedWhisperXVersion as string }),
      ...(runtimeConfigString(config.expectedPunktTabDigest, "WhisperX expectedPunktTabDigest") === undefined
        ? {} : { expectedPunktTabDigest: config.expectedPunktTabDigest as string }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "WhisperX defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(runtimeConfigPositiveInteger(config.requestTimeoutMs, "WhisperX requestTimeoutMs") === undefined
        ? {} : { requestTimeoutMs: config.requestTimeoutMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxResponseBytes, "WhisperX maxResponseBytes") === undefined
        ? {} : { maxResponseBytes: config.maxResponseBytes as number }),
    });
  },
  service: localWhisperXService,
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-whisperx-local",
  hostFacets: [localWhisperXRuntimeAdapter],
};

export default svmlPackage;
