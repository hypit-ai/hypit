import { resolve } from "node:path";

import {
  createRuntimeServiceAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-adapter";

import { createFileArtifactStorePackage } from "./store.js";

const fileArtifactStoreAdapter = createRuntimeServiceAdapterFacet({
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
      root: resolve(context.root, path),
      instance: context.instance,
    });
  },
});

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/artifact-store-fs",
  hostFacets: [fileArtifactStoreAdapter],
};

export default svmlPackage;
