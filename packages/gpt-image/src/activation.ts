import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation/graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";
import { gptImageComponent, gptImageManifest } from "./index.js";
import { gptImageAuthorDeclarations } from "./declaration.js";
import { gptImageGenerationNode, gptImageGenerationPresentation } from "./generation.js";
export const hypitPackage = {
  facets: [
    createModuleFacet(gptImageManifest), createGenerationModuleFacet(gptImageManifest),
    ...[gptImageComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...gptImageAuthorDeclarations.map(createAuthorDeclarationFacet),
    createGenerationNodePackageFacet({ nodes: [gptImageGenerationNode] }),
    createGenerationCanvasPresentationFacet({ nodes: [gptImageGenerationPresentation] }),
  ],
};
export default hypitPackage;
