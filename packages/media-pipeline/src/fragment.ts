import { mediaTypes } from "@hypit/media";
import { artifactTypes } from "@hypit/artifact";
import { programSpaceTypes } from "@hypit/program-space";
import { speechTypes } from "@hypit/speech";
import { sealGraphFragment } from "@hypit/elaborator";

import {
  mediaPipelineProducers,
  mediaPipelineTypes,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const synchronizedMediaFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "request", type: mediaPipelineTypes.selectionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection" },
    },
    {
      id: "select",
      producer: mediaPipelineProducers.select,
      inputs: { inspection: operation("inspect"), request: input("request") },
      result: { kind: "output", name: "selection" },
    },
    {
      id: "normalize",
      producer: mediaPipelineProducers.normalize,
      inputs: {
        source: input("source"),
        inspection: operation("inspect"),
        selection: operation("select"),
        request: input("request"),
      },
      result: { kind: "need", name: "media" },
    },
  ],
  exports: [{
    name: "media",
    type: mediaTypes.synchronized,
    root: operation("normalize"),
  }],
});

export const prepareMediaFragment = sealGraphFragment({
  inputs: [{ name: "source", type: artifactTypes.blob }],
  operations: [{
    id: "prepare",
    producer: mediaPipelineProducers.prepare,
    inputs: { source: input("source") },
    result: { kind: "need", name: "artifact" },
  }],
  exports: [{ name: "artifact", type: artifactTypes.blob, root: operation("prepare") }],
});

export const transformMediaFragment = sealGraphFragment({
  inputs: [
    { name: "media", type: mediaTypes.synchronized },
    { name: "program", type: mediaPipelineTypes.transformProgram },
  ],
  operations: [
    {
      id: "transform",
      producer: mediaPipelineProducers.transform,
      inputs: { media: input("media"), program: input("program") },
      result: { kind: "need", name: "video" },
    },
  ],
  exports: [{
    name: "video",
    type: artifactTypes.blob,
    root: operation("transform"),
  }],
});

export const extractAudioFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "request", type: mediaPipelineTypes.audioExtractionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection" },
    },
    {
      id: "extract",
      producer: mediaPipelineProducers.extractAudio,
      inputs: { source: input("source"), inspection: operation("inspect"), request: input("request") },
      result: { kind: "need", name: "audio" },
    },
  ],
  exports: [{
    name: "audio",
    type: artifactTypes.blob,
    root: operation("extract"),
  }],
});

export const extractFrameFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "request", type: mediaPipelineTypes.frameExtractionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection" },
    },
    {
      id: "extract",
      producer: mediaPipelineProducers.extractFrame,
      inputs: { source: input("source"), inspection: operation("inspect"), request: input("request") },
      result: { kind: "need", name: "image" },
    },
  ],
  exports: [{
    name: "image",
    type: artifactTypes.blob,
    root: operation("extract"),
  }],
});

export const stillVideoFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "duration", type: speechTypes.duration },
    { name: "clock", type: programSpaceTypes.clock },
  ],
  operations: [
    {
      id: "plan",
      producer: mediaPipelineProducers.planStill,
      inputs: { duration: input("duration"), clock: input("clock") },
      result: { kind: "output", name: "request" },
    },
    {
      id: "render",
      producer: mediaPipelineProducers.renderStill,
      inputs: { source: input("source"), request: operation("plan") },
      result: { kind: "need", name: "video" },
    },
  ],
  exports: [{
    name: "video",
    type: artifactTypes.blob,
    root: operation("render"),
  }],
});
