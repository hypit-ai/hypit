import { narrativeComponent, narrativeManifest } from "./index.js";
export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: narrativeManifest }],
  components: [narrativeComponent],
};
export default hypitPackage;
