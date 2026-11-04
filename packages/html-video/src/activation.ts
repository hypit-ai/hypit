import { htmlVideoManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: htmlVideoManifest }],
  facets: [],
};
export default hypitPackage;
