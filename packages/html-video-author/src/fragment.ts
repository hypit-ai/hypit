import { temporalTypes } from "@hypit/temporal-graph";
import { blobTypes } from "@hypit/blob";

import { mediaProducers, mediaTypes } from "@hypit/media";
import { sealGraphFragment } from "@hypit/generation-authoring/author";
import { htmlProgramProducers, htmlProgramTypes } from "@hypit/html-program";
import { audioProgramProducers, audioProgramTypes } from "@hypit/audio-program";
import { mediaDeliveryProducers } from "@hypit/media-delivery";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Source/Author terminal fragment; direct NLE export does not use this graph. */
export function createHtmlVideoFragment(selectedRange = false) {
  return sealGraphFragment({
    inputs: [
      { name: "program", type: htmlProgramTypes.program },
      { name: "audio", type: audioProgramTypes.program },
      { name: "delivery", type: mediaTypes.delivery },
      ...(selectedRange ? [
        { name: "visual-range", type: temporalTypes.frameSpan },
        { name: "audio-range", type: audioProgramTypes.renderRange },
      ] : []),
    ],
    operations: [
      {
        id: "project-visual-delivery",
        producer: mediaProducers.visualDelivery,
        inputs: { delivery: input("delivery") },
        result: { kind: "output" as const, name: "visual" },
      },
      {
        id: "request-visual",
        producer: selectedRange ? htmlProgramProducers.requestVisualRange : htmlProgramProducers.requestVisual,
        inputs: { program: input("program"), delivery: operation("project-visual-delivery"),
          ...(selectedRange ? { range: input("visual-range") } : {}) },
        result: { kind: "need" as const, name: "visual" },
      },
      {
        id: "request-audio-render",
        producer: selectedRange ? audioProgramProducers.renderRange : audioProgramProducers.render,
        inputs: { program: input("audio"),
          ...(selectedRange ? { range: input("audio-range") } : {}) },
        result: { kind: "need" as const, name: "audio" },
      },
      {
        id: "request-mux",
        producer: mediaDeliveryProducers.mux,
        inputs: {
          visual: operation("request-visual"),
          audio: operation("request-audio-render"),
          delivery: input("delivery"),
        },
        result: { kind: "need" as const, name: "media" },
      },
      {
        id: "project-video",
        producer: mediaDeliveryProducers.projectVideo,
        inputs: { media: operation("request-mux") },
        result: { kind: "output" as const, name: "video" },
      },
    ],
    exports: [{
      name: "video",
      type: blobTypes.blob,
      root: operation("project-video"),
    }],
  });

}

export const htmlVideoFragment = createHtmlVideoFragment();
