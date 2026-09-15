import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@hypit/runtime-kit";

import { createOrcaRouterProvider } from "./provider.js";

const adapter = createRuntimeEndpointAdapterFacet({
  use: "@hypit/provider-orcarouter",
  activate(context) {
    if (context.pool === undefined) throw new Error("OrcaRouter Provider Pool is required");
    const config = runtimeConfigObject(context.config, "OrcaRouter");
    runtimeConfigExact(config, [
      "baseUrl",
      "authBaseUrl",
      "apiKey",
      "defaultConcurrency",
      "requestTimeoutMs",
      "oauthRequestTimeoutMs",
    ], "OrcaRouter");
    const baseUrl = runtimeConfigString(config.baseUrl, "OrcaRouter baseUrl");
    const authBaseUrl = runtimeConfigString(config.authBaseUrl, "OrcaRouter authBaseUrl");
    const apiKey = runtimeConfigCredentialRef(config.apiKey, "OrcaRouter apiKey");
    if (apiKey === undefined) throw new Error("OrcaRouter apiKey CredentialRef is required");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "OrcaRouter defaultConcurrency");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "OrcaRouter requestTimeoutMs");
    const oauthRequestTimeoutMs = runtimeConfigPositiveInteger(config.oauthRequestTimeoutMs, "OrcaRouter oauthRequestTimeoutMs");
    // Origin validation lives with the provider so the adapter cannot accept an origin the provider rejects.
    const provider = createOrcaRouterProvider({
      instance: context.instance,
      pool: context.pool,
      ...(baseUrl === undefined ? {} : { baseUrl }),
      ...(authBaseUrl === undefined ? {} : { authBaseUrl }),
      apiKey,
      ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
      ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
      ...(oauthRequestTimeoutMs === undefined ? {} : { oauthRequestTimeoutMs }),
    });
    return {
      endpoint: provider.endpoint,
      diagnose: async (doctorContext) => await provider.diagnose(doctorContext),
    };
  },
});

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  hostFacets: [adapter],
};

export default hypitPackage;
