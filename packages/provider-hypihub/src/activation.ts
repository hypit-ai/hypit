import {
  createExecutionEnvironmentEndpointAdapterFacet,
  executionEnvironmentConfigCredentialRef,
  executionEnvironmentConfigActionLimits,
  executionEnvironmentConfigExact,
  executionEnvironmentConfigObject,
  executionEnvironmentConfigPositiveInteger,
  executionEnvironmentConfigString,
} from "@hypit/execution-environment-local/extension";

import { createHypiHubProvider, diagnoseHypiHubProvider } from "./provider.js";

const adapter = createExecutionEnvironmentEndpointAdapterFacet({
  use: "@hypit/provider-hypihub",
  activate(context) {
    if (context.pool === undefined) throw new Error("HypiHub Provider Pool is required");
    const config = executionEnvironmentConfigObject(context.config, "HypiHub");
    executionEnvironmentConfigExact(config, [
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
    const baseUrl = executionEnvironmentConfigString(config.baseUrl, "HypiHub baseUrl");
    if (baseUrl !== undefined) {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
        throw new Error("HypiHub baseUrl must use HTTPS or loopback");
      }
    }
    const apiKey = executionEnvironmentConfigCredentialRef(config.apiKey, "HypiHub apiKey");
    if (apiKey === undefined) throw new Error("HypiHub apiKey CredentialRef is required");
    const actionLimits = executionEnvironmentConfigActionLimits(config.actionLimits);
    const defaultConcurrency = executionEnvironmentConfigPositiveInteger(config.defaultConcurrency, "HypiHub defaultConcurrency");
    const pollIntervalMs = executionEnvironmentConfigPositiveInteger(config.pollIntervalMs, "HypiHub pollIntervalMs");
    const requestTimeoutMs = executionEnvironmentConfigPositiveInteger(config.requestTimeoutMs, "HypiHub requestTimeoutMs");
    const oauthRequestTimeoutMs = executionEnvironmentConfigPositiveInteger(config.oauthRequestTimeoutMs, "HypiHub oauthRequestTimeoutMs");
    const pricingRequestTimeoutMs = executionEnvironmentConfigPositiveInteger(config.pricingRequestTimeoutMs, "HypiHub pricingRequestTimeoutMs");
    const operationTimeoutMs = executionEnvironmentConfigPositiveInteger(config.operationTimeoutMs, "HypiHub operationTimeoutMs");
    const uploadConcurrency = executionEnvironmentConfigPositiveInteger(config.uploadConcurrency, "HypiHub uploadConcurrency");
    const uploadPartTimeoutMs = executionEnvironmentConfigPositiveInteger(config.uploadPartTimeoutMs, "HypiHub uploadPartTimeoutMs");
    const uploadPartAttempts = executionEnvironmentConfigPositiveInteger(config.uploadPartAttempts, "HypiHub uploadPartAttempts");
    const downloadAttempts = executionEnvironmentConfigPositiveInteger(config.downloadAttempts, "HypiHub downloadAttempts");
    const transcriptionModel = executionEnvironmentConfigString(config.transcriptionModel, "HypiHub transcriptionModel");
    const capabilityConcurrency = config.capabilityConcurrency === undefined ? undefined : Object.fromEntries(
      Object.entries(executionEnvironmentConfigObject(config.capabilityConcurrency, "HypiHub capabilityConcurrency"))
        .map(([name, value]) => [name, executionEnvironmentConfigPositiveInteger(value, `HypiHub ${name} capacity`)!]),
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
  facets: [adapter],
};

export default hypitPackage;
