import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { seedreamEndpoints, seedreamModuleRef } from "./index.js";

const using = { module: seedreamModuleRef, name: "seedream-5-lite.image" } as const;
export const seedreamGenerationNode = createFieldModelGenerationNode({ using, endpoint: seedreamEndpoints.image!, output: "image" });
export const seedreamGenerationPresentation: GenerationCanvasNodePresentation = {
  using, displayName: "Seedream 5 Lite Image", modelLabel: "Seedream 5 Lite", role: "image", summaryInput: "prompt",
  authoring: { controls: [
    { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the image" },
    { id: "aspectRatio", label: "Aspect ratio", placement: "compact" },
    { id: "quality", label: "Quality", placement: "compact" },
    { id: "outputFormat", label: "Format", placement: "advanced" },
    { id: "nsfwCheck", label: "Safety check", placement: "advanced" },
  ], ports: [{ id: "images", label: "Reference images" }] },
};
export const seedreamGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: [seedreamGenerationNode] }),
  createGenerationCanvasPresentationFacet({ nodes: [seedreamGenerationPresentation] }),
] as const;
