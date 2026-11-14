import { createGenerationCanvasPresentationFacet, type GenerationCanvasNodePresentation } from "@hypit/generation-canvas";
import { createFieldModelGenerationNode } from "@hypit/generation-model/model-fields/graph";
import { createGenerationNodePackageFacet } from "@hypit/hypit/generation/graph";
import { fishAudioSpeechEndpoints, fishAudioSpeechModuleRef } from "./index.js";

const specs = [
  { endpoint: fishAudioSpeechEndpoints.voiceDesign!, name: "voice-design-1.audio", label: "Fish Audio Voice Design", port: false },
  { endpoint: fishAudioSpeechEndpoints.voiceClone!, name: "voice-clone.audio", label: "Fish Audio Voice Clone", port: true },
] as const;
export const fishAudioSpeechGenerationNodes = specs.map(({ endpoint, name }) => createFieldModelGenerationNode({
  using: { module: fishAudioSpeechModuleRef, name }, endpoint, output: "audio",
}));
export const fishAudioSpeechGenerationPresentations: readonly GenerationCanvasNodePresentation[] = specs.map(({ name, label, port }) => ({
  using: { module: fishAudioSpeechModuleRef, name }, displayName: label, modelLabel: label, role: "audio", summaryInput: "text",
  authoring: { controls: [
    { id: "text", label: "Speech", placement: "primary", placeholder: "Words to speak" },
    ...(port ? [] : [{ id: "voiceDescription", label: "Voice description", placement: "advanced" as const }]),
  ], ...(port ? { ports: [{ id: "voiceReference", label: "Voice reference" }] } : {}) },
}));
export const fishAudioSpeechGenerationFacets = [
  createGenerationNodePackageFacet({ nodes: fishAudioSpeechGenerationNodes }),
  createGenerationCanvasPresentationFacet({ nodes: fishAudioSpeechGenerationPresentations }),
] as const;
