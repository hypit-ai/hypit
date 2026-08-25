import { captionProducers, captionTypes } from "@hypit/caption";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackProducers, semanticTrackTypes } from "@hypit/semantic-track";

import { captionFineProducers, captionFineTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** One timing join plus one Style-family render operation, regardless of how many Styles are used. */
export const fineCaptionTrackFragment = sealGraphFragment({
  inputs: [
    { name: "document", type: narrativeTypes.captionDocument },
    { name: "semantic", type: semanticTrackTypes.track },
    { name: "program", type: captionTypes.program },
  ],
  operations: [
    {
      id: "caption:space",
      producer: semanticTrackProducers.projectProgramSpace,
      inputs: { track: input("semantic") },
      result: { kind: "output", name: "space" },
    },
    {
      id: "caption:temporalize-document",
      producer: captionProducers.temporalizeDocument,
      inputs: {
        document: input("document"), semantic: input("semantic"), program: input("program"),
      },
      result: { kind: "output", name: "caption" },
    },
    {
      id: "caption-fine:schedule",
      producer: captionFineProducers.schedule,
      inputs: {
        caption: operation("caption:temporalize-document"), program: input("program"), document: input("document"),
      },
      result: { kind: "output", name: "schedule" },
    },
    {
      id: "caption-fine:render",
      producer: captionFineProducers.render,
      inputs: {
        schedule: operation("caption-fine:schedule"), program: input("program"),
        document: input("document"), space: operation("caption:space"),
      },
      result: { kind: "output", name: "track" },
    },
  ],
  exports: [
    {
      name: "schedule",
      type: captionFineTypes.schedule,
      root: operation("caption-fine:schedule"),
    },
    {
      name: "track",
      type: compositionTypes.visualTrack,
      root: operation("caption-fine:render"),
    },
  ],
});
