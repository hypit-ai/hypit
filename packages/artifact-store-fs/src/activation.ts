import { resolve } from "node:path";

import {
  createRuntimeInfrastructureAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-kit";

import { createFileArtifactStorePackage } from "./store.js";

const fileArtifactStoreAdapter = createRuntimeInfrastructureAdapterFacet({
  use: "@narratage/artifact-store-fs",
  validate(context) {
    const config = runtimeConfigObject(context.config, "filesystem ArtifactStore");
    runtimeConfigExact(config, ["path"], "filesystem ArtifactStore");
    if (runtimeConfigString(config.path, "Artifact path") === undefined) throw new Error("Artifact path is required");
  },
  create(context) {
    const config = runtimeConfigObject(context.config, "filesystem ArtifactStore");
    const path = runtimeConfigString(config.path, "Artifact path");
    if (path === undefined) throw new Error("Artifact path is required");
    return createFileArtifactStorePackage({
      root: resolve(context.dataRoot, path),
      instance: context.instance,
    });
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [fileArtifactStoreAdapter],
};

export default narratagePackage;
