import { timelineTypes } from "@hypit/timeline";

import { blobTypes } from "@hypit/hypit/blob";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/hypit/author";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { mediaTypes } from "@hypit/media";

import { visualTrackProducers, visualTrackTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Minimal complete graph witness; richer Surfaces generate the same primitive operations dynamically. */
export const stillVisualTrackFragment = sealGraphFragment({
  inputs: [
    { name: "header", type: visualTrackTypes.header },
    { name: "timeline", type: timelineTypes.timeline },
    { name: "source", type: blobTypes.blob },
    { name: "picture", type: mediaTypes.pictureInterpretation },
    { name: "extent", type: spatialTypes.extent },
    { name: "frame", type: spatialTypes.frame },
    { name: "fit", type: spatialTypes.fit },
    { name: "sample-spec", type: visualTrackTypes.sampleLayerSpec },
    { name: "clip-spec", type: visualTrackTypes.clipSpec },
    { name: "window", type: temporalTypes.window },
  ],
  operations: [
    { id: "layers", producer: visualTrackProducers.createLayers, inputs: {}, result: { kind: "output" as const, name: "layers" } },
    { id: "sample", producer: visualTrackProducers.appendStillLayer, inputs: {
      layers: operation("layers"), source: input("source"), picture: input("picture"), extent: input("extent"), fit: input("fit"), spec: input("sample-spec"),
    }, result: { kind: "output" as const, name: "layers" } },
    { id: "set", producer: visualTrackProducers.createSet, inputs: {}, result: { kind: "output" as const, name: "set" } },
    { id: "append", producer: visualTrackProducers.appendClip, inputs: {
      set: operation("set"), header: input("header"), timeline: input("timeline"), layers: operation("sample"),
      frame: input("frame"), spec: input("clip-spec"), window: input("window"),
    }, result: { kind: "output" as const, name: "set" } },
    { id: "finalize", producer: visualTrackProducers.finalize, inputs: {
      set: operation("append"), header: input("header"), timeline: input("timeline"),
    }, result: { kind: "output" as const, name: "program" } },
    { id: "visual", producer: visualTrackProducers.projectVisual, inputs: {
      timeline: input("timeline"), program: operation("finalize"),
    }, result: { kind: "output" as const, name: "track" } },
  ],
  exports: [
    { name: "program", type: visualTrackTypes.program, root: operation("finalize") },
    { name: "visual", type: compositionTypes.visualTrack, root: operation("visual") },
  ],
});

export const renderVisualTrackFragment = sealGraphFragment({
  inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "program", type: visualTrackTypes.program }],
  operations: [
    { id: "visual", producer: visualTrackProducers.projectVisual, inputs: { timeline: input("timeline"), program: input("program") }, result: { kind: "output" as const, name: "track" } },
  ],
  exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation("visual") }],
});
