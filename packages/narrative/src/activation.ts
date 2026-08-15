import { narrativeManifest } from "./index.js";
export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: narrativeManifest }],
};
export default narratagePackage;
