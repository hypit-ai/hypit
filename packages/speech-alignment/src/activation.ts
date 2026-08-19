import { speechAlignmentComponent, speechAlignmentManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: speechAlignmentManifest }],
  components: [speechAlignmentComponent],
};
export default hypitPackage;
