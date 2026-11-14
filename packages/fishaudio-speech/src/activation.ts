import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/generation/markup";
import { fishAudioSpeechComponent, fishAudioSpeechManifest, fishAudioSpeechModuleRef } from "./index.js";
import { fishAudioSpeechAuthorDeclarations, fishAudioSpeechMarkupDeclarations } from "./declaration.js";
import { fishAudioSpeechGenerationFacets } from "./generation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(fishAudioSpeechManifest), createGenerationModuleFacet(fishAudioSpeechManifest),
    ...[fishAudioSpeechComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...fishAudioSpeechAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...fishAudioSpeechMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: fishAudioSpeechModuleRef, declaration })),
    ...fishAudioSpeechGenerationFacets,

  ],
};

export default hypitPackage;
