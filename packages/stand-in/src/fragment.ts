import { artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import { mediaPipelineProducers } from "@hypit/media-pipeline";
import { programSpaceTypes } from "@hypit/program-space";
import { spatialTypes } from "@hypit/spatial";
import { speechTypes } from "@hypit/speech";

import { standInProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (name: string) => ({ kind: "fragment-operation" as const, operation: name });

export const standInCardFragment = sealGraphFragment({
  inputs: [{ name: "canvas", type: spatialTypes.canvas }],
  operations: [{
    id: "card",
    producer: standInProducers.card,
    inputs: { canvas: input("canvas") },
    result: { kind: "need", name: "image" },
  }],
  exports: [{ name: "image", type: artifactTypes.blob, root: operation("card") }],
});

/** A Card held by media-pipeline with its optional clip-local diagnostic guide. */
export const standInTimedCardFragment = sealGraphFragment({
  inputs: [
    { name: "canvas", type: spatialTypes.canvas },
    { name: "duration", type: speechTypes.duration },
    { name: "clock", type: programSpaceTypes.clock },
  ],
  operations: [
    {
      id: "card",
      producer: standInProducers.card,
      inputs: { canvas: input("canvas") },
      result: { kind: "need", name: "image" },
    },
    {
      id: "layout",
      producer: mediaPipelineProducers.clipTimeLayout,
      inputs: {},
      result: { kind: "output", name: "layout" },
    },
    {
      id: "plan",
      producer: mediaPipelineProducers.planStill,
      inputs: { duration: input("duration"), clock: input("clock"), layout: operation("layout") },
      result: { kind: "output", name: "request" },
    },
    {
      id: "bind",
      producer: mediaPipelineProducers.bindStill,
      inputs: { request: operation("plan"), source: operation("card") },
      result: { kind: "output", name: "request" },
    },
    {
      id: "render",
      producer: mediaPipelineProducers.renderStill,
      inputs: { request: operation("bind") },
      result: { kind: "need", name: "video" },
    },
  ],
  exports: [{ name: "video", type: artifactTypes.blob, root: operation("render") }],
});
