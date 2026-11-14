import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation-model/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation/graph";
import { pixverseEndpointsByModel, pixverseModuleRef, pixverseModels } from "./index.js";

const label = { "pixverse-v6": "PixVerse V6", "pixverse-c1": "PixVerse C1" } as const;
export const pixverseGenerationNodes = pixverseModels.map((model) => createFieldModelGenerationNode({
  using: { module: pixverseModuleRef, name: `${model}.video` }, endpoint: pixverseEndpointsByModel[model], output: "video",
}));
export const pixverseGenerationPresentations: readonly GenerationCanvasNodePresentation[] = pixverseModels.map((model) => ({
  using: { module: pixverseModuleRef, name: `${model}.video` }, displayName: `${label[model]} Video`,
  modelLabel: label[model], role: "video", summaryInput: "prompt",
  authoring: { controls: [
    { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the video" },
    { id: "duration", label: "Duration", placement: "compact" },
    { id: "quality", label: "Quality", placement: "compact" },
    { id: "aspectRatio", label: "Aspect ratio", placement: "compact" },
    { id: "generateAudio", label: "Generate audio", placement: "advanced" },
    { id: "multiClip", label: "Multi clip", placement: "advanced" },
    { id: "seed", label: "Seed", placement: "advanced" },
  ], ports: [
    { id: "firstFrame", label: "First frame" }, { id: "lastFrame", label: "Last frame" },
    { id: "referenceImage", label: "Reference images" }, { id: "referenceVideo", label: "Reference videos" },
  ] },
}));
export const pixverseGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: pixverseGenerationNodes }),
  createGenerationCanvasPresentationFacet({ nodes: pixverseGenerationPresentations }),
] as const;
