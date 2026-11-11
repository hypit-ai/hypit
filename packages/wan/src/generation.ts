import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { wanEndpoints, wanModuleRef, wanModels } from "./index.js";

const endpoints = { "wan-2.7-image": wanEndpoints.image!, "wan-2.7-image-pro": wanEndpoints.pro! } as const;
const labels = { "wan-2.7-image": "Wan 2.7 Image", "wan-2.7-image-pro": "Wan 2.7 Image Pro" } as const;
export const wanGenerationNodes = wanModels.map((model) => createFieldModelGenerationNode({
  using: { module: wanModuleRef, name: `${model}.image` }, endpoint: endpoints[model], output: "image",
}));
export const wanGenerationPresentations: readonly GenerationCanvasNodePresentation[] = wanModels.map((model) => ({
  using: { module: wanModuleRef, name: `${model}.image` }, displayName: labels[model], modelLabel: labels[model],
  role: "image", summaryInput: "prompt",
  authoring: { controls: [
    { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the image" },
    { id: "resolution", label: "Resolution", placement: "compact" },
    { id: "count", label: "Count", placement: "compact" },
    { id: "imageSet", label: "Image set", placement: "advanced" },
    { id: "extendedReasoning", label: "Extended reasoning", placement: "advanced" },
    { id: "watermark", label: "Watermark", placement: "advanced" },
    { id: "seed", label: "Seed", placement: "advanced" },
  ], ports: [{ id: "images", label: "Reference images" }] },
}));
export const wanGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: wanGenerationNodes }),
  createGenerationCanvasPresentationFacet({ nodes: wanGenerationPresentations }),
] as const;
