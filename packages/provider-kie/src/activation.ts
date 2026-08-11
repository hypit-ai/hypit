import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createKieProvider } from "./provider.js";

const kieRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-kie",
  activate(context) {
    const config = runtimeConfigObject(context.config, "KIE");
    runtimeConfigExact(config, [
      "apiBaseUrl", "uploadBaseUrl", "apiKey", "defaultConcurrency", "pollIntervalMs",
      "submissionIntervalMs", "requestTimeoutMs", "maxOperationMs", "maxArtifactBytes",
    ], "KIE");
    const apiBaseUrl = runtimeConfigString(config.apiBaseUrl, "KIE apiBaseUrl");
    const uploadBaseUrl = runtimeConfigString(config.uploadBaseUrl, "KIE uploadBaseUrl");
    for (const [value, subject] of [[apiBaseUrl, "KIE apiBaseUrl"], [uploadBaseUrl, "KIE uploadBaseUrl"]] as const) {
      if (value === undefined) continue;
      const url = new URL(value);
      if (url.protocol !== "https:" && url.hostname !== "localhost") {
        throw new Error(`${subject} must use HTTPS or localhost`);
      }
    }
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "KIE apiKey");
    if (apiKey === undefined) throw new Error("KIE apiKey CredentialRef is required");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "KIE defaultConcurrency");
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "KIE pollIntervalMs");
    const submissionIntervalMs = runtimeConfigPositiveInteger(config.submissionIntervalMs, "KIE submissionIntervalMs");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "KIE requestTimeoutMs");
    const maxOperationMs = runtimeConfigPositiveInteger(config.maxOperationMs, "KIE maxOperationMs");
    const maxArtifactBytes = runtimeConfigPositiveInteger(config.maxArtifactBytes, "KIE maxArtifactBytes");
    return {
      endpoint: createKieProvider({
        instance: context.instance,
        ...(context.lane === undefined ? {} : { lane: context.lane }),
        ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
        ...(uploadBaseUrl === undefined ? {} : { uploadBaseUrl }),
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
        ...(submissionIntervalMs === undefined ? {} : { submissionIntervalMs }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(maxOperationMs === undefined ? {} : { maxOperationMs }),
        ...(maxArtifactBytes === undefined ? {} : { maxArtifactBytes }),
      }),
    };
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-kie",
  hostFacets: [kieRuntimeAdapter],
};

export default svmlPackage;
