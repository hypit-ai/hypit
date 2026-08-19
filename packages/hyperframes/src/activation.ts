import { hyperframesComponent, hyperframesManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: hyperframesManifest }],
  components: [hyperframesComponent],
};
export default hypitPackage;
