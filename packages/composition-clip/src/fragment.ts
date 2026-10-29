import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/hypit/author";
import { mediaTypes } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import { compositionClipProducers, compositionClipTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const compositionOccurrenceFragment = sealGraphFragment({
  inputs: [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "source", type: compositionTypes.composition },
    { name: "window", type: temporalTypes.window },
    { name: "spec", type: compositionClipTypes.occurrenceSpec },
  ],
  operations: [{
    id: "occurrence",
    producer: compositionClipProducers.createOccurrence,
    inputs: { timeline: input("timeline"), source: input("source"), window: input("window"), spec: input("spec") },
    result: { kind: "output", name: "occurrence" },
  }],
  exports: [{ name: "occurrence", type: compositionClipTypes.occurrence, root: operation("occurrence") }],
});

export const compositionVisualFragment = sealGraphFragment({
  inputs: [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "picture", type: mediaTypes.workingPicture },
    { name: "occurrence", type: compositionClipTypes.occurrence },
    { name: "spec", type: compositionClipTypes.visualUseSpec },
    { name: "frame", type: spatialTypes.frame },
  ],
  operations: [{
    id: "use",
    producer: compositionClipProducers.bindVisualUse,
    inputs: { spec: input("spec"), frame: input("frame") },
    result: { kind: "output", name: "use" },
  }, {
    id: "visual",
    producer: compositionClipProducers.renderVisual,
    inputs: {
      timeline: input("timeline"), picture: input("picture"), occurrence: input("occurrence"), use: operation("use"),
    },
    result: { kind: "output", name: "track" },
  }],
  exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation("visual") }],
});

export const compositionAudioFragment = sealGraphFragment({
  inputs: [
    { name: "timeline", type: timelineTypes.timeline },
    { name: "occurrence", type: compositionClipTypes.occurrence },
    { name: "use", type: compositionClipTypes.audioUse },
  ],
  operations: [{
    id: "audio",
    producer: compositionClipProducers.renderAudio,
    inputs: { timeline: input("timeline"), occurrence: input("occurrence"), use: input("use") },
    result: { kind: "output", name: "track" },
  }],
  exports: [{ name: "audio", type: compositionTypes.audioTrack, root: operation("audio") }],
});
