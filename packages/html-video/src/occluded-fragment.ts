import { timelineTypes } from "@hypit/timeline";
import { mediaTypes } from "@hypit/media";
import { blobTypes } from "@hypit/hypit/blob";

import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/hypit/author";
import { htmlProgramProducers, htmlProgramTypes } from "@hypit/html-program";
import { mediaOperationsProducers } from "@hypit/media-operations";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/**
 * Two-layer render: everything below the subject's z in one pass, then the subject cut over it.
 *
 * The split happens at compile time, not in the browser: `compile-band` builds a second HtmlProgram
 * whose Presents are restricted to the band, so the Pass below the subject is rasterized on its own
 * and the mask is composited over it. A Present at or above the subject's z is therefore not painted
 * at all -- it belongs to a pass this element does not ask for yet.
 */
export function createHtmlOccludedVideoFragment() {
  return sealGraphFragment({
    inputs: [
      { name: "composition", type: compositionTypes.composition },
      { name: "timeline", type: timelineTypes.timeline },
      { name: "band", type: htmlProgramTypes.zBand },
      { name: "subject", type: blobTypes.blob },
    ],
    operations: [
      {
        id: "compile-program",
        producer: htmlProgramProducers.compileBand,
        inputs: {
          composition: input("composition"),
          timeline: input("timeline"),
          band: input("band"),
        },
        result: { kind: "output", name: "program" },
      },
      {
        id: "request-visual",
        producer: htmlProgramProducers.requestVisual,
        inputs: { program: operation("compile-program") },
        result: { kind: "need", name: "visual" },
      },
      {
        id: "project-visual-artifact",
        producer: mediaOperationsProducers.visualArtifact,
        inputs: { visual: operation("request-visual") },
        result: { kind: "output", name: "artifact" },
      },
      {
        id: "composite-subject",
        producer: mediaOperationsProducers.composite,
        inputs: { under: operation("project-visual-artifact"), over: input("subject") },
        result: { kind: "need", name: "video" },
      },
    ],
    exports: [{
      name: "video",
      type: blobTypes.blob,
      root: operation("composite-subject"),
    }],
  });
}

export const htmlOccludedVideoFragment = createHtmlOccludedVideoFragment();
