import { speechTakeComponent, speechTakeManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@svml/speech-take",
  modules: [{ manifest: speechTakeManifest }],
  components: [speechTakeComponent],
};
export default svmlPackage;
