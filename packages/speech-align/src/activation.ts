import { speechAlignComponent, speechAlignManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/speech-align",
  modules: [{ manifest: speechAlignManifest }],
  components: [speechAlignComponent],
};
export default svmlPackage;
