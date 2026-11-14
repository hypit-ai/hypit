import { createModuleFacet } from "@hypit/hypit/module";
import { createGenerationModuleFacet } from "@hypit/hypit/generation/build";
import { createRefinementPackageFacet } from "@hypit/hypit/generation/refinement";
import { createProducerPackageFacet } from "@hypit/hypit/generation/producer";
import { createAuthorDeclarationFacet } from "@hypit/hypit/generation/author";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation/graph";
import { createGenerationCanvasPresentationFacet } from "@hypit/generation-canvas";
import { seedanceComponent, seedanceManifest } from "./index.js";
import { seedanceAuthorDeclarations } from "./declaration.js";
import { seedanceGenerationNodeDeclarations, seedanceGenerationPresentations } from "./generation.js";

export const hypitPackage = {
  facets: [
    createModuleFacet(seedanceManifest), createGenerationModuleFacet(seedanceManifest),
    ...[seedanceComponent].flatMap((component) => [createProducerPackageFacet(component.producers ?? []), createRefinementPackageFacet(component.refinements ?? [])]),
    ...seedanceAuthorDeclarations.map(createAuthorDeclarationFacet),
    createGenerationNodePackageFacet({ nodes: seedanceGenerationNodeDeclarations }),
    createGenerationCanvasPresentationFacet({ nodes: seedanceGenerationPresentations }),
  ],
};

export default hypitPackage;
