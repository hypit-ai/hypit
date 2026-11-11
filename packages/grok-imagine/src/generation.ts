import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { grokImagineEndpoints, grokImagineModuleRef } from "./index.js";

const specs = [
  { endpoint: grokImagineEndpoints.video!, name: "grok-imagine-video.video", label: "Grok Imagine Video" },
  { endpoint: grokImagineEndpoints["preview-1.5"]!, name: "grok-imagine-video-1.5-preview.video", label: "Grok Imagine Video 1.5" },
] as const;
export const grokImagineGenerationNodes = specs.map(({ endpoint, name }) => createFieldModelGenerationNode({
  using: { module: grokImagineModuleRef, name }, endpoint, output: "video",
}));
export const grokImagineGenerationPresentations: readonly GenerationCanvasNodePresentation[] = specs.map(({ name, label }) => ({
  using: { module: grokImagineModuleRef, name }, displayName: label, modelLabel: label, role: "video", summaryInput: "prompt",
  authoring: { controls: [
    { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the video" },
    { id: "duration", label: "Duration", placement: "compact" },
    { id: "resolution", label: "Resolution", placement: "compact" },
    { id: "aspectRatio", label: "Aspect ratio", placement: "compact" },
  ], ports: [{ id: "images", label: "Reference images" }] },
}));
export const grokImagineGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: grokImagineGenerationNodes }),
  createGenerationCanvasPresentationFacet({ nodes: grokImagineGenerationPresentations }),
] as const;
