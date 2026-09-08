import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigActionLimits,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createHypiHubProvider, diagnoseHypiHubProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-hypihub",
  activate(context) {
    if (context.pool === undefined) throw new Error("HypiHub Provider Pool is required");
    const config = runtimeConfigObject(context.config, "HypiHub");
    runtimeConfigExact(config, [
      "baseUrl",
      "apiKey",
      "defaultConcurrency",
      "actionLimits",
      "capabilityConcurrency",
      "pollIntervalMs",
      "requestTimeoutMs",
      "oauthRequestTimeoutMs",
      "pricingRequestTimeoutMs",
      "operationTimeoutMs",
      "uploadConcurrency",
      "uploadPartTimeoutMs",
      "uploadPartAttempts",
      "downloadAttempts",
      "transcriptionModel",
    ], "HypiHub");
    const baseUrl = runtimeConfigString(config.baseUrl, "HypiHub baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("HypiHub baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "HypiHub apiKey");
    if (apiKey === undefined) throw new Error("HypiHub apiKey CredentialRef is required");
    const actionLimits = runtimeConfigActionLimits(config.actionLimits);
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "HypiHub defaultConcurrency");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "HypiHub pollIntervalMs");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "HypiHub requestTimeoutMs");
    const oauthRequestTimeoutMs = runtimeConfigPositiveInteger(config.oauthRequestTimeoutMs, "HypiHub oauthRequestTimeoutMs");
    const pricingRequestTimeoutMs = runtimeConfigPositiveInteger(config.pricingRequestTimeoutMs, "HypiHub pricingRequestTimeoutMs");
    const operationTimeoutMs = runtimeConfigPositiveInteger(config.operationTimeoutMs, "HypiHub operationTimeoutMs");
    const uploadConcurrency = runtimeConfigPositiveInteger(config.uploadConcurrency, "HypiHub uploadConcurrency");
    const uploadPartTimeoutMs = runtimeConfigPositiveInteger(config.uploadPartTimeoutMs, "HypiHub uploadPartTimeoutMs");
    const uploadPartAttempts = runtimeConfigPositiveInteger(config.uploadPartAttempts, "HypiHub uploadPartAttempts");
    const downloadAttempts = runtimeConfigPositiveInteger(config.downloadAttempts, "HypiHub downloadAttempts");
    const transcriptionModel = runtimeConfigString(config.transcriptionModel, "HypiHub transcriptionModel");
    const capabilityConcurrency = config.capabilityConcurrency === undefined ? undefined : Object.fromEntries(
      Object.entries(runtimeConfigObject(config.capabilityConcurrency, "HypiHub capabilityConcurrency"))
        .map(([name, value]) => [name, runtimeConfigPositiveInteger(value, `HypiHub ${name} capacity`)!]),
    );
    const options = {
        instance: context.instance,
        pool: context.pool,
        ...(baseUrl === undefined ? {} : { baseUrl }),
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(actionLimits === undefined ? {} : { actionLimits }),
        ...(capabilityConcurrency === undefined ? {} : { capabilityConcurrency }),
        ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(oauthRequestTimeoutMs === undefined ? {} : { oauthRequestTimeoutMs }),
        ...(pricingRequestTimeoutMs === undefined ? {} : { pricingRequestTimeoutMs }),
        ...(operationTimeoutMs === undefined ? {} : { operationTimeoutMs }),
        ...(uploadConcurrency === undefined ? {} : { uploadConcurrency }),
        ...(uploadPartTimeoutMs === undefined ? {} : { uploadPartTimeoutMs }),
        ...(uploadPartAttempts === undefined ? {} : { uploadPartAttempts }),
        ...(downloadAttempts === undefined ? {} : { downloadAttempts }),
        ...(transcriptionModel === undefined ? {} : { transcriptionModel }),
      };
    return {
      endpoint: createHypiHubProvider(options),
      diagnose: async (doctor) => await diagnoseHypiHubProvider(options, doctor),
    };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [adapter],
};

export default hypitPackage;
