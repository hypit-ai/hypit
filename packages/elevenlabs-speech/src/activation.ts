import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/generation/markup";
import { elevenLabsSpeechComponent, elevenLabsSpeechManifest, elevenLabsSpeechModuleRef } from "./index.js";
import { elevenLabsSpeechAuthorDeclarations, elevenLabsSpeechMarkupDeclarations } from "./declaration.js";
import { elevenLabsSpeechGenerationFacets } from "./generation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(elevenLabsSpeechManifest), createGenerationModuleFacet(elevenLabsSpeechManifest),
    ...[elevenLabsSpeechComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...elevenLabsSpeechAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...elevenLabsSpeechMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: elevenLabsSpeechModuleRef, declaration })),
    ...elevenLabsSpeechGenerationFacets,
  ],
};

export default hypitPackage;
