import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigCredentialRef,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import { diagnoseRuntimeEnvironmentCredential } from "@narratage/runtime-adapter-node";

import { createGoogleVertexCaptionProvider } from "./provider.js";

const googleVertexRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-google-vertex",
  activate(context) {
    const config = runtimeConfigObject(context.config, "Google Vertex");
    runtimeConfigExact(config, [
      "project", "projectEnv", "location", "credentials", "defaultConcurrency",
      "requestTimeoutMs", "maxResponseBytes",
    ], "Google Vertex");
    const projectValue = runtimeConfigString(config.project, "Google Vertex project");
    const projectEnv = runtimeConfigString(config.projectEnv, "Google Vertex projectEnv");
    if ((projectValue === undefined) === (projectEnv === undefined)) {
      throw new Error("Google Vertex requires exactly one of project or projectEnv");
    }
    const credentials = runtimeConfigCredentialRef(config.credentials, "Google Vertex credentials");
    if (credentials === undefined) throw new Error("Google Vertex credentials CredentialRef is required");
    const location = runtimeConfigString(config.location, "Google Vertex location");
    const defaultConcurrency = runtimeConfigPositiveInteger(config.defaultConcurrency, "Google Vertex defaultConcurrency");
    const requestTimeoutMs = runtimeConfigPositiveInteger(config.requestTimeoutMs, "Google Vertex requestTimeoutMs");
    const maxResponseBytes = runtimeConfigPositiveInteger(config.maxResponseBytes, "Google Vertex maxResponseBytes");
    return {
      endpoint: createGoogleVertexCaptionProvider({
        ...(projectValue === undefined ? { projectEnv: projectEnv! } : { project: projectValue }),
        instance: context.instance,
        ...(context.lane === undefined ? {} : { lane: context.lane }),
        ...(location === undefined ? {} : { location }),
        credentialsJson: credentials,
        ...(defaultConcurrency === undefined ? {} : { defaultConcurrency }),
        ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
        ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
      }),
      ...(projectEnv === undefined ? {} : {
        diagnose: () => diagnoseRuntimeEnvironmentCredential(projectEnv, "Google Vertex project"),
      }),
    };
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-google-vertex",
  hostFacets: [googleVertexRuntimeAdapter],
};

export default svmlPackage;
