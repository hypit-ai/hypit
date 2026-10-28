import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { elevenLabsSpeechComponent, elevenLabsSpeechManifest, elevenLabsSpeechModuleRef } from "./index.js";
import { elevenLabsSpeechAuthorDeclarations, elevenLabsSpeechMarkupDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: elevenLabsSpeechManifest }],
  facets: [
    ...[elevenLabsSpeechComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...elevenLabsSpeechAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...elevenLabsSpeechMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: elevenLabsSpeechModuleRef, declaration })),
  ],
};

export default hypitPackage;
