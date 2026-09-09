import { mediaTypes } from "@hypit/media";
import { artifactTypes } from "@hypit/artifact";
import { programSpaceTypes } from "@hypit/program-space";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import { hyperframesProducers } from "@hypit/hyperframes";
import { mediaPipelineProducers } from "@hypit/media-pipeline";

import {
  renderHyperframesProducers,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createRenderHyperframesFragment(selectedRange = false) {
  return sealGraphFragment({
    inputs: [
      { name: "composition", type: compositionTypes.composition },
      { name: "space", type: programSpaceTypes.programSpace },
      ...(selectedRange ? [{ name: "range", type: mediaTypes.frameRange }] : []),
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
        producer: selectedRange ? renderHyperframesProducers.requestVisualRange : renderHyperframesProducers.requestVisual,
        inputs: { document: operation("compile-document"), ...(selectedRange ? { range: input("range") } : {}) },
        result: { kind: "need", name: "visual" },
      },
      {
        id: "compile-audio-program",
        producer: mediaPipelineProducers.planAudio,
        inputs: { composition: input("composition"), space: input("space") },
        result: { kind: "output", name: "plan" },
      },
      {
        id: "request-audio-render",
        producer: selectedRange ? mediaPipelineProducers.renderAudioRange : mediaPipelineProducers.renderAudio,
        inputs: { plan: operation("compile-audio-program"), ...(selectedRange ? { range: input("range") } : {}) },
        result: { kind: "need", name: "audio" },
      },
      {
        id: "request-mux",
        producer: mediaPipelineProducers.mux,
        inputs: {
          visual: operation("request-visual-render"),
          audio: operation("request-audio-render"),
        },
        result: { kind: "need", name: "media" },
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
      type: artifactTypes.blob,
      root: operation("project-video"),
    }],
  });

}

export const renderHyperframesFragment = createRenderHyperframesFragment();
