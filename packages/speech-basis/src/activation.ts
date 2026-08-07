import { speechBasisComponent, speechBasisManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/speech-basis",
  modules: [{ manifest: speechBasisManifest }],
  components: [speechBasisComponent],
};
export default svmlPackage;
