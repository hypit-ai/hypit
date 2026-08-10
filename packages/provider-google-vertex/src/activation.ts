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
  validate(context) {
    const config = runtimeConfigObject(context.config, "Google Vertex");
    runtimeConfigExact(config, [
      "project", "projectEnv", "location", "credentials", "defaultConcurrency",
      "requestTimeoutMs", "maxResponseBytes",
    ], "Google Vertex");
    const project = runtimeConfigString(config.project, "Google Vertex project");
    const projectEnv = runtimeConfigString(config.projectEnv, "Google Vertex projectEnv");
    if ((project === undefined) === (projectEnv === undefined)) {
      throw new Error("Google Vertex requires exactly one of project or projectEnv");
    }
    runtimeConfigString(config.location, "Google Vertex location");
    if (runtimeConfigCredentialRef(config.credentials, "Google Vertex credentials") === undefined) {
      throw new Error("Google Vertex credentials CredentialRef is required");
    }
    runtimeConfigPositiveInteger(config.defaultConcurrency, "Google Vertex defaultConcurrency");
    runtimeConfigPositiveInteger(config.requestTimeoutMs, "Google Vertex requestTimeoutMs");
    runtimeConfigPositiveInteger(config.maxResponseBytes, "Google Vertex maxResponseBytes");
  },
  create(context) {
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
    const project = projectValue ?? process.env[projectEnv!]?.trim();
    if (project === undefined || project.length === 0) throw new Error(`Google Vertex project environment ${projectEnv} is empty`);
    const credentials = runtimeConfigCredentialRef(config.credentials, "Google Vertex credentials");
    if (credentials === undefined) throw new Error("Google Vertex credentials CredentialRef is required");
    return createGoogleVertexCaptionProvider({
      project,
      instance: context.instance,
      ...(context.lane === undefined ? {} : { lane: context.lane }),
      ...(runtimeConfigString(config.location, "Google Vertex location") === undefined
        ? {} : { location: config.location as string }),
      credentialsJson: credentials,
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
    const projectEnv = runtimeConfigString(config.projectEnv, "Google Vertex projectEnv");
    return projectEnv === undefined ? [] : diagnoseRuntimeEnvironmentCredential(projectEnv, "Google Vertex project");
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/provider-google-vertex",
  hostFacets: [googleVertexRuntimeAdapter],
};

export default svmlPackage;
