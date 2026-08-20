import { artifactTypes } from "@hypit/artifact";
import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";

import { mediaTrackProducers, mediaTrackTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

/** Minimal complete graph witness; richer Surfaces generate the same primitive operations dynamically. */
export const stillMediaTrackFragment = sealGraphFragment({
  inputs: [
    { name: "header", type: mediaTrackTypes.header },
    { name: "semantic", type: semanticTrackTypes.track },
    { name: "canvas", type: spatialTypes.canvas },
    { name: "source", type: artifactTypes.blob },
    { name: "extent", type: spatialTypes.extent },
    { name: "frame", type: spatialTypes.frame },
    { name: "fit", type: spatialTypes.fit },
    { name: "sample-spec", type: mediaTrackTypes.sampleLayerSpec },
    { name: "item-spec", type: mediaTrackTypes.itemSpec },
  ],
  operations: [
    { id: "layers", producer: mediaTrackProducers.createLayers, inputs: {}, result: { kind: "output", name: "layers" } },
    { id: "sample", producer: mediaTrackProducers.appendStillLayer, inputs: {
      layers: operation("layers"), source: input("source"), extent: input("extent"), fit: input("fit"), spec: input("sample-spec"),
    }, result: { kind: "output", name: "layers" } },
    { id: "set", producer: mediaTrackProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } },
    { id: "sounds", producer: mediaTrackProducers.createSounds, inputs: {}, result: { kind: "output", name: "sounds" } },
    { id: "append", producer: mediaTrackProducers.appendProgramItem, inputs: {
      set: operation("set"), header: input("header"), semantic: input("semantic"), canvas: input("canvas"), layers: operation("sample"),
      frame: input("frame"), spec: input("item-spec"), sounds: operation("sounds"),
    }, result: { kind: "output", name: "set" } },
    { id: "finalize", producer: mediaTrackProducers.finalize, inputs: {
      set: operation("append"), header: input("header"), semantic: input("semantic"),
    }, result: { kind: "output", name: "program" } },
    { id: "visual", producer: mediaTrackProducers.projectVisual, inputs: {
      semantic: input("semantic"), program: operation("finalize"),
    }, result: { kind: "output", name: "track" } },
  ],
  exports: [
    { name: "program", type: mediaTrackTypes.program, root: operation("finalize") },
    { name: "track", type: compositionTypes.visualTrack, root: operation("visual") },
  ],
});

export const renderMediaTrackFragment = sealGraphFragment({
  inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "program", type: mediaTrackTypes.program }],
  operations: [{ id: "visual", producer: mediaTrackProducers.projectVisual, inputs: { semantic: input("semantic"), program: input("program") }, result: { kind: "output", name: "track" } }],
  exports: [{ name: "track", type: compositionTypes.visualTrack, root: operation("visual") }],
});
