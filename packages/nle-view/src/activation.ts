import { createAuthorDeclarationFacet, createAuthorEditPlannerFacet } from "@hypit/hypit/author";

import { nleViewAuthorDeclaration, nleViewEditPlanner, nleViewManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: nleViewManifest }],
  facets: [
    createAuthorDeclarationFacet(nleViewAuthorDeclaration),
    createAuthorEditPlannerFacet(nleViewEditPlanner),
  ],
};

export default hypitPackage;
