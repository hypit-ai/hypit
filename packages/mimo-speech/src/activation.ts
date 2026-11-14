import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createMarkupDeclarationFacet } from "@hypit/hypit/generation/markup";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation/graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";
import { mimoSpeechComponent, mimoSpeechManifest, mimoSpeechModuleRef } from "./index.js";
import { mimoSpeechAuthorDeclarations, mimoSpeechMarkupDeclarations } from "./declaration.js";
import { mimoSpeechGenerationNodeDeclarations, mimoSpeechGenerationPresentations } from "./generation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(mimoSpeechManifest), createGenerationModuleFacet(mimoSpeechManifest),
    ...[mimoSpeechComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...mimoSpeechAuthorDeclarations.map(createAuthorDeclarationFacet),
    ...mimoSpeechMarkupDeclarations.map((declaration) =>
      createMarkupDeclarationFacet({ module: mimoSpeechModuleRef, declaration })),
    createGenerationNodePackageFacet({ nodes: mimoSpeechGenerationNodeDeclarations }),
    createGenerationCanvasPresentationFacet({ nodes: mimoSpeechGenerationPresentations }),

  ],
};

export default hypitPackage;
