import { contractTypes } from "@narratage/contracts";
import { sealGraphFragment } from "@narratage/elaborator";
import { hyperframesProducers } from "@narratage/hyperframes";
import { mediaPipelineProducers } from "@narratage/media-pipeline";

import {
  hyperframesRenderProducers,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const hyperframesRenderFragment = sealGraphFragment({
  name: "@narratage/hyperframes-render/video@1",
  inputs: [
    { name: "composition", type: contractTypes.composition },
    { name: "space", type: contractTypes.programSpace },
  ],
  operations: [
    {
      id: "compile-document",
      producer: hyperframesProducers.compile,
      inputs: { composition: input("composition"), space: input("space") },
      result: { kind: "output", name: "document" },
    },
    {
      id: "request-visual-render",
      producer: hyperframesRenderProducers.requestVisual,
      inputs: { document: operation("compile-document") },
      result: { kind: "need", name: "visual", accepts: "exact" },
    },
    {
      id: "compile-audio-program",
      producer: mediaPipelineProducers.planAudio,
      inputs: { composition: input("composition"), space: input("space") },
      result: { kind: "output", name: "plan" },
    },
    {
      id: "request-audio-render",
      producer: mediaPipelineProducers.renderAudio,
      inputs: { plan: operation("compile-audio-program") },
      result: { kind: "need", name: "audio", accepts: "exact" },
    },
    {
      id: "request-mux",
      producer: mediaPipelineProducers.mux,
      inputs: {
        visual: operation("request-visual-render"),
        audio: operation("request-audio-render"),
      },
      result: { kind: "need", name: "media", accepts: "exact" },
    },
    {
      id: "project-video",
      producer: mediaPipelineProducers.projectMuxed,
      inputs: { media: operation("request-mux") },
      result: { kind: "output", name: "video" },
    },
  ],
  exports: [{
    name: "video",
    type: contractTypes.mediaArtifact,
    root: operation("project-video"),
    semanticInputs: ["composition", "space"],
    fidelity: "exact",
  }],
});
