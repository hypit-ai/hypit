import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/markup";
import { fishAudioSpeechComponent, fishAudioSpeechManifest, fishAudioSpeechModuleRef } from "./index.js";
import { fishAudioSpeechAuthorDeclarations, fishAudioSpeechMarkupDeclarations } from "./declaration.js";

export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{ manifest: fishAudioSpeechManifest }],
  facets: [
    ...[fishAudioSpeechComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...fishAudioSpeechAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...fishAudioSpeechMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: fishAudioSpeechModuleRef, declaration })),

  ],
};

export default hypitPackage;
