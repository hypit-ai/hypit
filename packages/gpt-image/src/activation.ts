import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";
import { gptImageComponent, gptImageManifest } from "./index.js";
import { gptImageAuthorDeclarations } from "./declaration.js";
import { gptImageGenerationNode, gptImageGenerationPresentation } from "./generation.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: gptImageManifest,
  }],
  facets: [
    ...[gptImageComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...gptImageAuthorDeclarations.map(createAuthorDeclarationFacet),
    createGenerationNodePackageFacet({ nodes: [gptImageGenerationNode] }),
    createGenerationCanvasPresentationFacet({ nodes: [gptImageGenerationPresentation] }),
  ],
};
export default hypitPackage;
