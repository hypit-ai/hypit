import { artifactTypes } from "@narratage/artifact";
import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import { programSpaceTypes } from "@narratage/program-space";
import { spatialTypes } from "@narratage/spatial";

import { mediaTrackProducers, mediaTrackTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const stillMediaTrackFragment = sealGraphFragment({
  name: "@narratage/media-track/one-full-still@1",
  inputs: [
    { name: "header", type: mediaTrackTypes.header },
    { name: "space", type: programSpaceTypes.programSpace },
    { name: "source", type: artifactTypes.blob },
    { name: "extent", type: spatialTypes.extent },
    { name: "frame", type: spatialTypes.frame },
    { name: "fit", type: spatialTypes.fit },
    { name: "spec", type: mediaTrackTypes.stillItemSpec },
  ],
  operations: [
    { id: "set", producer: mediaTrackProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } },
    { id: "append", producer: mediaTrackProducers.appendFullStill, inputs: {
      set: operation("set"), header: input("header"), space: input("space"), source: input("source"),
      extent: input("extent"), frame: input("frame"), fit: input("fit"), spec: input("spec"),
    }, result: { kind: "output", name: "set" } },
    { id: "finalize", producer: mediaTrackProducers.finalize, inputs: { set: operation("append"), header: input("header") }, result: { kind: "output", name: "program" } },
    { id: "render", producer: mediaTrackProducers.render, inputs: { space: input("space"), program: operation("finalize") }, result: { kind: "output", name: "track" } },
  ],
  exports: [
    { name: "program", type: mediaTrackTypes.program, root: operation("finalize"), semanticInputs: ["header", "space", "source", "extent", "frame", "fit", "spec"], fidelity: "exact" },
    { name: "track", type: compositionTypes.visualTrack, root: operation("render"), semanticInputs: ["header", "space", "source", "extent", "frame", "fit", "spec"], fidelity: "exact" },
  ],
});

export const renderMediaTrackFragment = sealGraphFragment({
  name: "@narratage/media-track/render@1",
  inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: mediaTrackTypes.program }],
  operations: [{ id: "render", producer: mediaTrackProducers.render, inputs: { space: input("space"), program: input("program") }, result: { kind: "output", name: "track" } }],
  exports: [{ name: "track", type: compositionTypes.visualTrack, root: operation("render"), semanticInputs: ["space", "program"], fidelity: "exact" }],
});
