import { credentialRef } from "@narratage/runtime";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import { diagnoseRuntimeEnvironmentCredential } from "@narratage/runtime-adapter-node";

import { createKieProvider } from "./provider.js";

const kieRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-kie",
  validate(context) {
    const config = runtimeConfigObject(context.config, "KIE");
    runtimeConfigExact(config, [
      "apiBaseUrl", "uploadBaseUrl", "apiKeyEnv", "defaultConcurrency", "pollIntervalMs",
      "submissionIntervalMs", "requestTimeoutMs", "maxOperationMs", "maxArtifactBytes",
    ], "KIE");
    for (const [key, subject] of [["apiBaseUrl", "KIE apiBaseUrl"], ["uploadBaseUrl", "KIE uploadBaseUrl"]] as const) {
      const value = runtimeConfigString(config[key], subject);
      if (value === undefined) continue;
      const url = new URL(value);
      if (url.protocol !== "https:" && url.hostname !== "localhost") {
        throw new Error(`${subject} must use HTTPS or localhost`);
      }
    }
    runtimeConfigString(config.apiKeyEnv, "KIE apiKeyEnv");
    runtimeConfigPositiveInteger(config.defaultConcurrency, "KIE defaultConcurrency");
    runtimeConfigPositiveInteger(config.pollIntervalMs, "KIE pollIntervalMs");
    runtimeConfigPositiveInteger(config.submissionIntervalMs, "KIE submissionIntervalMs");
    runtimeConfigPositiveInteger(config.requestTimeoutMs, "KIE requestTimeoutMs");
    runtimeConfigPositiveInteger(config.maxOperationMs, "KIE maxOperationMs");
    runtimeConfigPositiveInteger(config.maxArtifactBytes, "KIE maxArtifactBytes");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "KIE");
    runtimeConfigExact(config, [
      "apiBaseUrl", "uploadBaseUrl", "apiKeyEnv", "defaultConcurrency", "pollIntervalMs",
      "submissionIntervalMs", "requestTimeoutMs", "maxOperationMs", "maxArtifactBytes",
    ], "KIE");
    const apiKeyEnv = runtimeConfigString(config.apiKeyEnv, "KIE apiKeyEnv");
    return createKieProvider({
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(runtimeConfigString(config.apiBaseUrl, "KIE apiBaseUrl") === undefined
        ? {} : { apiBaseUrl: config.apiBaseUrl as string }),
      ...(runtimeConfigString(config.uploadBaseUrl, "KIE uploadBaseUrl") === undefined
        ? {} : { uploadBaseUrl: config.uploadBaseUrl as string }),
      ...(apiKeyEnv === undefined ? {} : { apiKey: credentialRef("env", apiKeyEnv) }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "KIE defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(runtimeConfigPositiveInteger(config.pollIntervalMs, "KIE pollIntervalMs") === undefined
        ? {} : { pollIntervalMs: config.pollIntervalMs as number }),
      ...(runtimeConfigPositiveInteger(config.submissionIntervalMs, "KIE submissionIntervalMs") === undefined
        ? {} : { submissionIntervalMs: config.submissionIntervalMs as number }),
      ...(runtimeConfigPositiveInteger(config.requestTimeoutMs, "KIE requestTimeoutMs") === undefined
        ? {} : { requestTimeoutMs: config.requestTimeoutMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxOperationMs, "KIE maxOperationMs") === undefined
        ? {} : { maxOperationMs: config.maxOperationMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxArtifactBytes, "KIE maxArtifactBytes") === undefined
        ? {} : { maxArtifactBytes: config.maxArtifactBytes as number }),
    });
  },
  doctor(context) {
    const config = runtimeConfigObject(context.config, "KIE");
    const apiKeyEnv = runtimeConfigString(config.apiKeyEnv, "KIE apiKeyEnv") ?? "KIE_API_KEY";
    return diagnoseRuntimeEnvironmentCredential(apiKeyEnv, "KIE");
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-kie",
  hostFacets: [kieRuntimeAdapter],
};

export default svmlPackage;
