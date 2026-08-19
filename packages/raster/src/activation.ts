import { rasterManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: rasterManifest }],
};
export default hypitPackage;
