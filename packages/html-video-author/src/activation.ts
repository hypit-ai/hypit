import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { htmlVideoAuthorManifest } from "./index.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(htmlVideoAuthorManifest), createGenerationModuleFacet(htmlVideoAuthorManifest),],
};
export default hypitPackage;
