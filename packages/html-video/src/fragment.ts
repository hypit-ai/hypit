import { timelineTypes } from "@hypit/timeline";
import { blobTypes } from "@hypit/hypit/blob";

import { compositionTypes } from "@hypit/composition";
import { mediaProducers, mediaTypes } from "@hypit/media";
import { sealGraphFragment } from "@hypit/hypit/author";
import { htmlProgramProducers } from "@hypit/html-program";
import { audioProgramProducers } from "@hypit/audio-program";
import { mediaDeliveryProducers } from "@hypit/media-delivery";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createHtmlVideoFragment(selectedRange = false) {
  return sealGraphFragment({
    inputs: [
      { name: "composition", type: compositionTypes.composition },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "delivery", type: mediaTypes.delivery },
      ...(selectedRange ? [{ name: "range", type: timelineTypes.frameSpan }] : []),
    ],
    operations: [
      {
        id: "project-visual-delivery",
        producer: mediaProducers.visualDelivery,
        inputs: { delivery: input("delivery") },
        result: { kind: "output" as const, name: "visual" },
      },
      {
        id: "compile-program",
        producer: htmlProgramProducers.compile,
        inputs: { composition: input("composition"), timeline: input("timeline") },
        result: { kind: "output" as const, name: "program" },
      },
      {
        id: "request-visual",
        producer: selectedRange ? htmlProgramProducers.requestVisualRange : htmlProgramProducers.requestVisual,
        inputs: { program: operation("compile-program"), delivery: operation("project-visual-delivery"),
          ...(selectedRange ? { range: input("range") } : {}) },
        result: { kind: "need" as const, name: "visual" },
      },
      {
        id: "compile-audio-program",
        producer: audioProgramProducers.compile,
        inputs: { composition: input("composition"), timeline: input("timeline") },
        result: { kind: "output" as const, name: "program" },
      },
      {
        id: "request-audio-render",
        producer: selectedRange ? audioProgramProducers.renderRange : audioProgramProducers.render,
        inputs: { program: operation("compile-audio-program"), ...(selectedRange ? { range: input("range") } : {}) },
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
