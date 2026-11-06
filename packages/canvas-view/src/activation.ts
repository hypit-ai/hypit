import { createAuthorDeclarationFacet, createAuthorEditPlannerFacet } from "@hypit/hypit/author";

import { canvasViewAuthorDeclaration, canvasViewEditPlanner, canvasViewManifest } from "./index.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: canvasViewManifest }],
  facets: [
    createAuthorDeclarationFacet(canvasViewAuthorDeclaration),
    createAuthorEditPlannerFacet(canvasViewEditPlanner),
  ],
};

export default hypitPackage;
