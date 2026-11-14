import { createModuleFacet } from "@hypit/module";
import { createGenerationModuleFacet } from "@hypit/generation-build";
import { createMediaRepresentationFacet } from "@hypit/media-asset";

import { objectTrackManifest } from "./contract.js";
import { objectTrackMediaRepresentationPackage } from "./representation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(objectTrackManifest), createGenerationModuleFacet(objectTrackManifest),createMediaRepresentationFacet(objectTrackMediaRepresentationPackage)],
};

export default hypitPackage;
