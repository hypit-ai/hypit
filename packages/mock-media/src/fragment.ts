import { artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import { programSpaceTypes } from "@hypit/program-space";
import { spatialTypes } from "@hypit/spatial";
import { speechTypes } from "@hypit/speech";
import { mockMediaProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (name: string) => ({ kind: "fragment-operation" as const, operation: name });

export const mockImageFragment = sealGraphFragment({
  inputs: [{ name: "canvas", type: spatialTypes.canvas }],
  operations: [{ id: "image", producer: mockMediaProducers.image, inputs: { canvas: input("canvas") }, result: { kind: "need", name: "image" } }],
  exports: [{ name: "image", type: artifactTypes.blob, root: operation("image") }],
});

export const mockVideoFragment = sealGraphFragment({
  inputs: [
    { name: "canvas", type: spatialTypes.canvas },
    { name: "duration", type: speechTypes.duration },
    { name: "clock", type: programSpaceTypes.clock },
  ],
  operations: [{ id: "video", producer: mockMediaProducers.video, inputs: { canvas: input("canvas"), duration: input("duration"), clock: input("clock") }, result: { kind: "need", name: "video" } }],
  exports: [{ name: "video", type: artifactTypes.blob, root: operation("video") }],
});

export const mockSilenceFragment = sealGraphFragment({
  inputs: [{ name: "duration", type: speechTypes.duration }],
  operations: [{ id: "silence", producer: mockMediaProducers.silence, inputs: { duration: input("duration") }, result: { kind: "need", name: "audio" } }],
  exports: [{ name: "audio", type: artifactTypes.blob, root: operation("silence") }],
});
