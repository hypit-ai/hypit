import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { nanoBananaEndpoints, nanoBananaModuleRef } from "./index.js";

const specs = [
  { endpoint: nanoBananaEndpoints.v2!, name: "nano-banana-2.image", label: "Nano Banana 2" },
  { endpoint: nanoBananaEndpoints.pro!, name: "nano-banana-pro.image", label: "Nano Banana Pro" },
] as const;
export const nanoBananaGenerationNodes = specs.map(({ endpoint, name }) => createFieldModelGenerationNode({
  using: { module: nanoBananaModuleRef, name }, endpoint, output: "image",
}));
export const nanoBananaGenerationPresentations: readonly GenerationCanvasNodePresentation[] = specs.map(({ name, label }) => ({
  using: { module: nanoBananaModuleRef, name }, displayName: `${label} Image`, modelLabel: label, role: "image", summaryInput: "prompt",
  authoring: { controls: [
    { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the image" },
    { id: "aspectRatio", label: "Aspect ratio", placement: "compact" },
    { id: "resolution", label: "Resolution", placement: "compact" },
    { id: "outputFormat", label: "Format", placement: "advanced" },
  ], ports: [{ id: "images", label: "Reference images" }] },
}));
export const nanoBananaGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: nanoBananaGenerationNodes }),
  createGenerationCanvasPresentationFacet({ nodes: nanoBananaGenerationPresentations }),
] as const;
