import { htmlVideoAuthorManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlVideoAuthorManifest }],
  facets: [],
};
export default hypitPackage;
