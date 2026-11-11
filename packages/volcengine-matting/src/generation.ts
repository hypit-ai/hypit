import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { portraitMattingEndpoint, volcengineMattingModuleRef } from "./index.js";

const using = { module: volcengineMattingModuleRef, name: "matte-portrait-video.video" } as const;
export const portraitMattingGenerationNode = createFieldModelGenerationNode({
  using, endpoint: portraitMattingEndpoint, output: "video",
});
export const portraitMattingGenerationPresentation: GenerationCanvasNodePresentation = {
  using, displayName: "Portrait Matting", modelLabel: "Volcengine Matting", role: "video",
  authoring: { controls: [{ id: "format", label: "Format", placement: "compact" }],
    ports: [{ id: "source", label: "Source video" }] },
};
export const portraitMattingGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: [portraitMattingGenerationNode] }),
  createGenerationCanvasPresentationFacet({ nodes: [portraitMattingGenerationPresentation] }),
] as const;
