import { artifactManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: artifactManifest }],
};

export default svmlPackage;
