import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigActionLimits,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createKieProvider } from "./provider.js";

const kieRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-kie",
  activate(context) {
    if (context.pool === undefined) throw new Error("KIE Provider Pool is required");
    const config = runtimeConfigObject(context.config, "KIE");
    runtimeConfigExact(config, [
      "apiBaseUrl", "uploadBaseUrl", "apiKey", "defaultConcurrency", "pollIntervalMs",
      "capabilityConcurrency", "actionLimits", "requestTimeoutMs", "maxOperationMs", "maxArtifactBytes",
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
    const capabilityConcurrency = config.capabilityConcurrency === undefined
      ? undefined
      : Object.fromEntries(Object.entries(runtimeConfigObject(config.capabilityConcurrency, "KIE capabilityConcurrency"))
        .map(([capability, value]) => {
          const concurrency = runtimeConfigPositiveInteger(value, `KIE capabilityConcurrency.${capability}`);
          if (concurrency === undefined) throw new Error(`KIE capabilityConcurrency.${capability} is required`);
          return [capability, concurrency];
        }));
    const pollIntervalMs = runtimeConfigPositiveInteger(config.pollIntervalMs, "KIE pollIntervalMs");
    const actionLimits = runtimeConfigActionLimits(config.actionLimits);
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "KIE requestTimeoutMs");
    const maxOperationMs = runtimeConfigPositiveInteger(config.maxOperationMs, "KIE maxOperationMs");
    const maxArtifactBytes = runtimeConfigPositiveInteger(config.maxArtifactBytes, "KIE maxArtifactBytes");
    return {
      endpoint: createKieProvider({
        instance: context.instance,
        pool: context.pool,
        ...(apiBaseUrl === undefined ? {} : { apiBaseUrl }),
        ...(uploadBaseUrl === undefined ? {} : { uploadBaseUrl }),
        apiKey,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(capabilityConcurrency === undefined ? {} : { capabilityConcurrency }),
        ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
        ...(actionLimits === undefined ? {} : { actionLimits }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(maxOperationMs === undefined ? {} : { maxOperationMs }),
        ...(maxArtifactBytes === undefined ? {} : { maxArtifactBytes }),
      }),
    };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [kieRuntimeAdapter],
};

export default hypitPackage;
