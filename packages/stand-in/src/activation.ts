import { standInComponent, standInManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: standInManifest }],
  components: [standInComponent],
  hostFacets: [],
};

export default hypitPackage;
