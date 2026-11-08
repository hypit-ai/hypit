import { createMediaRepresentationFacet } from "@hypit/media-asset";

import { objectTrackManifest } from "./contract.js";
import { objectTrackMediaRepresentationPackage } from "./representation.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: objectTrackManifest }],
  facets: [createMediaRepresentationFacet(objectTrackMediaRepresentationPackage)],
};

export default hypitPackage;
