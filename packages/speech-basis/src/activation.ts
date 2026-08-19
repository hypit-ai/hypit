import { speechBasisComponent, speechBasisManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: speechBasisManifest }],
  components: [speechBasisComponent],
};
export default hypitPackage;
