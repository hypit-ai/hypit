import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createLocalWhisperXProvider } from "./provider.js";

const localWhisperXRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-whisperx-local",
  create(context) {
    const config = runtimeConfigObject(context.config, "local WhisperX");
    runtimeConfigExact(config, [
      "baseUrl", "expectedModel", "expectedDevice", "expectedCompute", "expectedBatchSize",
      "expectedServiceVersion", "expectedWhisperXVersion", "expectedPunktTabDigest",
      "defaultConcurrency", "requestTimeoutMs", "maxResponseBytes",
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
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-whisperx-local",
  hostFacets: [localWhisperXRuntimeAdapter],
};

export default svmlPackage;
