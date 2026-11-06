import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createAuthorDeclarationFacet, createAuthorEditPlannerFacet } from "@hypit/hypit/author";

import { audiovisualAuthorComponent } from "./component.js";
import { audiovisualAuthorManifest } from "./manifest.js";
import { audiovisualAuthorDeclarations } from "./declaration.js";
import { audiovisualProgramEditPlanner } from "./edit.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: audiovisualAuthorManifest }],
  facets: [
    ...audiovisualAuthorDeclarations.map(createAuthorDeclarationFacet),
    createAuthorEditPlannerFacet(audiovisualProgramEditPlanner),
    createProducerPackageFacet(audiovisualAuthorComponent.producers),
    createRefinementPackageFacet(audiovisualAuthorComponent.refinements),
  ],
};

export default hypitPackage;
