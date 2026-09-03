import { estimateManifest } from "./index.js";

/** The package declares one graph type and no Surface, Producer or Need: measuring is creation-time work. */
export const hypitPackage = {
  format: "hypit.node-package@1" as const,
  modules: [{ manifest: estimateManifest }],
  components: [],
  hostFacets: [],
};

export default hypitPackage;
