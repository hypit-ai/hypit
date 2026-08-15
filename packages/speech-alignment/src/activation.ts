import { speechAlignmentComponent, speechAlignmentManifest } from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: speechAlignmentManifest }],
  components: [speechAlignmentComponent],
};
export default narratagePackage;
