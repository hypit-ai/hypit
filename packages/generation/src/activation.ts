import { generationComponent, generationManifest } from "./index.js";

export const svmlPackage = {
  format: "svml.node-package@1" as const,
  modules: [{ manifest: generationManifest }],
  components: [generationComponent],
};

export default svmlPackage;
