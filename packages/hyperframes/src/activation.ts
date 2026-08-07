import { hyperframesComponent, hyperframesManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  name: "@narratage/hyperframes",
  modules: [{ manifest: hyperframesManifest }],
  components: [hyperframesComponent],
};
export default svmlPackage;
