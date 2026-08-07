import { artifactManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/artifact",
  modules: [{ manifest: artifactManifest }],
};

export default svmlPackage;
