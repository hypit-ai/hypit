import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { blobManifest } from "./index.js";

export const hypitPackage = {
  facets: [createModuleFacet(blobManifest), createGenerationModuleFacet(blobManifest)],
};

export default hypitPackage;
