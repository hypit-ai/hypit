import { createGenerationGraphProjectObjectOwnerFacet } from "./node/project-object.js";

export const hypitPackage = {
  facets: [createGenerationGraphProjectObjectOwnerFacet()],
};

export default hypitPackage;
