import { semanticTrackComponent, semanticTrackManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: semanticTrackManifest }],
  components: [semanticTrackComponent],
};
export default hypitPackage;
