import { temporalManifest } from "./index.js";
import { temporalComponent } from "./component.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: temporalManifest }],
  components: [temporalComponent],
};
export default hypitPackage;
