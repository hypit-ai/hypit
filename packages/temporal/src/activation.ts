import { temporalManifest } from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: temporalManifest }],
};
export default narratagePackage;
