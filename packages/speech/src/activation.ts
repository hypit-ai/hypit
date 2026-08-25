import { speechComponent, speechManifest } from "./index.js";
export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: speechManifest }],
  components: [speechComponent],
};
export default hypitPackage;
