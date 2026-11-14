import { createNleProjectObjectOwnerFacet } from "./node/project-object.js";

export const hypitPackage = {
  facets: [createNleProjectObjectOwnerFacet()],
};

export default hypitPackage;
