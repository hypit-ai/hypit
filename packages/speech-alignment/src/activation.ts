import { speechAlignmentComponent, speechAlignmentManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/speech-alignment",
  modules: [{ manifest: speechAlignmentManifest }],
  components: [speechAlignmentComponent],
};
export default svmlPackage;
