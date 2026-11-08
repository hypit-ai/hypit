import { createRefinementPackageFacet } from "@hypit/hypit/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/author";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { gptImageComponent, gptImageManifest } from "./index.js";
import { gptImageAuthorDeclarations } from "./declaration.js";
import { gptImageGenerationNode } from "./generation.js";
export const hypitPackage = {
  format: "hypit.package@1" as const,
  modules: [{
    manifest: gptImageManifest,
  }],
  facets: [
    ...[gptImageComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...gptImageAuthorDeclarations.map(createAuthorDeclarationFacet),
    createGenerationNodePackageFacet({ nodes: [gptImageGenerationNode] }),
  ],
};
export default hypitPackage;
