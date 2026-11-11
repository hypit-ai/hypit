import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation-graph";
import { elevenLabsSpeechEndpoints, elevenLabsSpeechModuleRef } from "./index.js";

const using = { module: elevenLabsSpeechModuleRef, name: "eleven_ttv_v3.audio" } as const;
export const elevenLabsSpeechGenerationNode = createFieldModelGenerationNode({
  using, endpoint: elevenLabsSpeechEndpoints.voiceDesign!, output: "audio",
});
export const elevenLabsSpeechGenerationPresentation: GenerationCanvasNodePresentation = {
  using, displayName: "ElevenLabs Voice Design", modelLabel: "ElevenLabs TTV v3", role: "audio", summaryInput: "text",
  authoring: { controls: [
    { id: "text", label: "Speech", placement: "primary", placeholder: "Words to speak" },
    { id: "voiceDescription", label: "Voice description", placement: "advanced" },
  ] },
};
export const elevenLabsSpeechGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: [elevenLabsSpeechGenerationNode] }),
  createGenerationCanvasPresentationFacet({ nodes: [elevenLabsSpeechGenerationPresentation] }),
] as const;
