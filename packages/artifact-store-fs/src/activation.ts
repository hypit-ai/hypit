import { resolve } from "node:path";

import {
  createRuntimeArtifactStoreAdapterFacet,
  runtimeConfigExact,
  runtimeConfigObject,
  runtimeConfigString,
} from "@narratage/runtime-kit";

import { FileArtifactStore } from "./store.js";

const fileArtifactStoreAdapter = createRuntimeArtifactStoreAdapterFacet({
  use: "@narratage/artifact-store-fs",
  validate(context) {
    const config = runtimeConfigObject(context.config, "filesystem ArtifactStore");
    runtimeConfigExact(config, ["path"], "filesystem ArtifactStore");
    if (runtimeConfigString(config.path, "Artifact path") === undefined) throw new Error("Artifact path is required");
  },
  open(context) {
    const config = runtimeConfigObject(context.config, "filesystem ArtifactStore");
    const path = runtimeConfigString(config.path, "Artifact path");
    if (path === undefined) throw new Error("Artifact path is required");
    return { value: new FileArtifactStore(resolve(context.dataRoot, path)) };
  },
});

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [fileArtifactStoreAdapter],
};

export default narratagePackage;
