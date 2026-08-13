import { speechAlignmentComponent, speechAlignmentManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: speechAlignmentManifest }],
  components: [speechAlignmentComponent],
};
export default svmlPackage;
