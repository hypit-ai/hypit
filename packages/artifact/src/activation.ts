import { artifactManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: artifactManifest }],
};

export default hypitPackage;
