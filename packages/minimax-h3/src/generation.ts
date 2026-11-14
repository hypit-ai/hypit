import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation-model/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation/graph";
import { minimaxH3Definition, minimaxH3ModuleRef } from "./index.js";

const using = { module: minimaxH3ModuleRef, name: "minimax-h3.video" } as const;
export const minimaxH3GenerationNode = createFieldModelGenerationNode({
  using, endpoint: minimaxH3Definition.endpoints.video!, output: "video",
});
export const minimaxH3GenerationPresentation: GenerationCanvasNodePresentation = {
  using, displayName: "MiniMax H3 Video", modelLabel: "MiniMax H3", role: "video", summaryInput: "prompt",
  authoring: { controls: [
    { id: "prompt", label: "Prompt", placement: "primary", placeholder: "Describe the video" },
    { id: "duration", label: "Duration", placement: "compact" },
    { id: "resolution", label: "Resolution", placement: "compact" },
    { id: "aspectRatio", label: "Aspect ratio", placement: "compact" },
  ], ports: [
    { id: "firstFrame", label: "First frame" }, { id: "lastFrame", label: "Last frame" },
    { id: "referenceImage", label: "Reference images" }, { id: "referenceVideo", label: "Reference videos" },
    { id: "referenceAudio", label: "Reference audio" },
  ] },
};
export const minimaxH3GenerationFacets = [
  createGenerationNodePackageFacet({ nodes: [minimaxH3GenerationNode] }),
  createGenerationCanvasPresentationFacet({ nodes: [minimaxH3GenerationPresentation] }),
] as const;
