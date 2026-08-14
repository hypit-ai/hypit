import { temporalManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: temporalManifest }],
};
export default svmlPackage;
