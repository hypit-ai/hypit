import { speechBasisComponent, speechBasisManifest } from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: speechBasisManifest }],
  components: [speechBasisComponent],
};
export default narratagePackage;
