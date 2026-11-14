import { createGenerationWorkspaceProjectObjectOwnerFacet } from "./node/project-object.js";

export const hypitPackage = {
  facets: [createGenerationWorkspaceProjectObjectOwnerFacet()],
};

export default hypitPackage;
