import { createMediaProjectObjectOwnerFacet } from "./node/project-object.js";

export const hypitPackage = {
  facets: [createMediaProjectObjectOwnerFacet()],
};

export default hypitPackage;
