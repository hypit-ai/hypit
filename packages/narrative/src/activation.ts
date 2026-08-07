import { narrativeManifest } from "./index.js";
export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/narrative",
  modules: [{ manifest: narrativeManifest }],
};
export default svmlPackage;
