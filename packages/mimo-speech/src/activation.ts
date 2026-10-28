import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { mimoSpeechComponent, mimoSpeechManifest, mimoSpeechModuleRef } from "./index.js";
import { mimoSpeechAuthorDeclarations, mimoSpeechMarkupDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: mimoSpeechManifest }],
  facets: [
    ...[mimoSpeechComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...mimoSpeechAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...mimoSpeechMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: mimoSpeechModuleRef, declaration })),

  ],
};

export default hypitPackage;
