import { credentialRef } from "@narratage/runtime";
import {
  createRuntimeEndpointAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigPositiveInteger,
  runtimeConfigString,
} from "@narratage/runtime-adapter";
import { diagnoseRuntimeEnvironmentCredential } from "@narratage/runtime-adapter-node";

import { createGoogleVertexCaptionProvider } from "./provider.js";

const googleVertexRuntimeAdapter = createRuntimeEndpointAdapterFacet({
  use: "@narratage/provider-google-vertex",
  validate(context) {
    const config = runtimeConfigObject(context.config, "Google Vertex");
    runtimeConfigExact(config, [
      "project", "projectEnv", "location", "credentialsEnv", "defaultConcurrency",
      "requestTimeoutMs", "maxResponseBytes",
    ], "Google Vertex");
    const project = runtimeConfigString(config.project, "Google Vertex project");
    const projectEnv = runtimeConfigString(config.projectEnv, "Google Vertex projectEnv");
    if (project !== undefined && projectEnv !== undefined) {
      throw new Error("Google Vertex accepts project or projectEnv, not both");
    }
    runtimeConfigString(config.location, "Google Vertex location");
    runtimeConfigString(config.credentialsEnv, "Google Vertex credentialsEnv");
    runtimeConfigPositiveInteger(config.defaultConcurrency, "Google Vertex defaultConcurrency");
    runtimeConfigPositiveInteger(config.requestTimeoutMs, "Google Vertex requestTimeoutMs");
    runtimeConfigPositiveInteger(config.maxResponseBytes, "Google Vertex maxResponseBytes");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "Google Vertex");
    runtimeConfigExact(config, [
      "project", "projectEnv", "location", "credentialsEnv", "defaultConcurrency",
      "requestTimeoutMs", "maxResponseBytes",
    ], "Google Vertex");
    const projectValue = runtimeConfigString(config.project, "Google Vertex project");
    const projectEnv = runtimeConfigString(config.projectEnv, "Google Vertex projectEnv");
    if (projectValue !== undefined && projectEnv !== undefined) {
      throw new Error("Google Vertex accepts project or projectEnv, not both");
    }
    const project = projectValue ?? (projectEnv === undefined ? undefined : process.env[projectEnv]?.trim());
    if (project === undefined || project.length === 0) throw new Error("Google Vertex project is required");
    const credentialsEnv = runtimeConfigString(config.credentialsEnv, "Google Vertex credentialsEnv");
    return createGoogleVertexCaptionProvider({
      project,
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(runtimeConfigString(config.location, "Google Vertex location") === undefined
        ? {} : { location: config.location as string }),
      ...(credentialsEnv === undefined ? {} : { credentialsJson: credentialRef("env", credentialsEnv) }),
      ...(runtimeConfigPositiveInteger(config.defaultConcurrency, "Google Vertex defaultConcurrency") === undefined
        ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(runtimeConfigPositiveInteger(config.requestTimeoutMs, "Google Vertex requestTimeoutMs") === undefined
        ? {} : { requestTimeoutMs: config.requestTimeoutMs as number }),
      ...(runtimeConfigPositiveInteger(config.maxResponseBytes, "Google Vertex maxResponseBytes") === undefined
        ? {} : { maxResponseBytes: config.maxResponseBytes as number }),
    });
  },
  doctor(context) {
    const config = runtimeConfigObject(context.config, "Google Vertex");
    const project = runtimeConfigString(config.project, "Google Vertex project");
    const projectEnv = runtimeConfigString(config.projectEnv, "Google Vertex projectEnv");
    const credentialsEnv = runtimeConfigString(config.credentialsEnv, "Google Vertex credentialsEnv")
      ?? "GOOGLE_APPLICATION_CREDENTIALS_JSON";
    return [
      ...(project !== undefined
        ? []
        : diagnoseRuntimeEnvironmentCredential(projectEnv ?? "GOOGLE_CLOUD_PROJECT", "Google Vertex project")),
      ...diagnoseRuntimeEnvironmentCredential(credentialsEnv, "Google Vertex credentials"),
    ];
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-google-vertex",
  hostFacets: [googleVertexRuntimeAdapter],
};

export default svmlPackage;
