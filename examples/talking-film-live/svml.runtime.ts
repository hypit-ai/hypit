import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { createFileArtifactStorePackage } from "@narratage/artifact-store-fs";
import { createEnvironmentCredentialStorePackage } from "@narratage/credential-store-env";
import { createLocalExecutionPackage, createProjectLocalRuntime } from "@narratage/local";
import { createGoogleVertexCaptionProvider } from "@narratage/provider-google-vertex";
import { createLocalHyperframesProvider } from "@narratage/provider-hyperframes-local";
import { createKieProvider } from "@narratage/provider-kie";
import { createLocalMediaProvider } from "@narratage/provider-media-local";
import { createLocalWhisperXProvider } from "@narratage/provider-whisperx-local";
import { credentialRef } from "@narratage/runtime";
import { createSqliteRuntimeServicePackage } from "@narratage/store-sqlite";

export default async function createTalkingFilmRuntime() {
  const root = fileURLToPath(new URL(".", import.meta.url));
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for the explicit Vertex Gemini Caption Provider");

  const endpoints = [
    createKieProvider({
      instance: "kie.talking-film",
      lane: "generation",
      apiKey: credentialRef("env", "KIE_API_KEY"),
      defaultConcurrency: 2,
    }),
    createLocalMediaProvider({
      instance: "media.talking-film",
      lane: "media",
      defaultConcurrency: 2,
    }),
    createLocalWhisperXProvider({
      instance: "whisperx.talking-film",
      lane: "alignment",
      defaultConcurrency: 1,
    }),
    createGoogleVertexCaptionProvider({
      project,
      instance: "vertex.talking-film",
      lane: "planning",
      credentialsJson: credentialRef("env", "GOOGLE_APPLICATION_CREDENTIALS_JSON"),
      defaultConcurrency: 1,
    }),
    createLocalHyperframesProvider({
      instance: "hyperframes.talking-film",
      lane: "render",
      workers: 2,
      quality: "standard",
      defaultConcurrency: 1,
    }),
  ];

  const execution = createLocalExecutionPackage("execution");
  const state = createSqliteRuntimeServicePackage({
    path: join(root, ".svml", "state.sqlite"),
    name: "state",
    buildInstance: "state.builds",
    operationInstance: "state.operations",
    dispatchInstance: "state.dispatch",
    journalInstance: "state.journal",
  });
  const artifacts = createFileArtifactStorePackage({
    root: join(root, ".svml", "artifacts"),
    instance: "artifacts",
  });
  const credentials = createEnvironmentCredentialStorePackage({ instance: "credentials.env" });

  return await createProjectLocalRuntime({
    root,
    packageLock: "./svml.packages.lock",
    runtimeServices: [execution, state, artifacts, credentials],
    runtimeSelection: {
      scheduler: "execution.scheduler",
      worker: "execution.worker",
      stores: {
        build: "state.builds",
        operations: "state.operations",
        dispatch: "state.dispatch",
        journal: "state.journal",
        artifacts: "artifacts",
        credentials: ["credentials.env"],
      },
    },
    endpoints,
    allowedPermissions: [...new Set([
      "filesystem:state",
      "filesystem:artifacts",
      "environment:credentials",
      ...endpoints.flatMap((endpoint) => endpoint.manifest.facets.flatMap((facet) => facet.permissions)),
    ])],
    scheduling: {
      maxConcurrency: 4,
      lanes: {
        generation: 2,
        media: 2,
        alignment: 1,
        planning: 1,
        render: 1,
      },
    },
  });
}
