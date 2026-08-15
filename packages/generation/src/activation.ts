import { generationComponent, generationManifest } from "./index.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  modules: [{ manifest: generationManifest }],
  components: [generationComponent],
};

export default narratagePackage;
