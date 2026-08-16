import { localRuntimeHostAdapter } from "./host.js";

export const narratagePackage = {
  format: "narratage.node-package@1" as const,
  hostFacets: [localRuntimeHostAdapter],
};

export default narratagePackage;
