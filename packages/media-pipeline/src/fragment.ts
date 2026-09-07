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

/**
 * A still video over `count` pictures: plan the frame split, bind each picture to its segment in
 * authored order, render once. The shape depends only on the count, so two elements with the same
 * number of pictures share one Fragment identity.
 */
export function createStillVideoFragment(count: number) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("A still video needs at least one picture");
  const sources = Array.from({ length: count }, (_, index) => `source-${index}`);
  return sealGraphFragment({
    inputs: [
      { name: "duration", type: speechTypes.duration },
      { name: "clock", type: programSpaceTypes.clock },
      { name: "layout", type: mediaPipelineTypes.stillVideoLayout },
      ...sources.map((name) => ({ name, type: artifactTypes.blob })),
    ],
    operations: [
      {
        id: "plan",
        producer: mediaPipelineProducers.planStill,
        inputs: { duration: input("duration"), clock: input("clock"), layout: input("layout") },
        result: { kind: "output", name: "request" },
      },
      ...sources.map((name, index) => ({
        id: `bind-${index}`,
        producer: mediaPipelineProducers.bindStill,
        inputs: { request: operation(index === 0 ? "plan" : `bind-${index - 1}`), source: input(name) },
        result: { kind: "output" as const, name: "request" },
      })),
      {
        id: "render",
        producer: mediaPipelineProducers.renderStill,
        inputs: { request: operation(`bind-${count - 1}`) },
        result: { kind: "need", name: "video" },
      },
    ],
    exports: [{
      name: "video",
      type: artifactTypes.blob,
      root: operation("render"),
    }],
  });
}

export const stillVideoFragment = createStillVideoFragment(1);

/** One picture held with a clip-local timecode, frame count and progress ruler for diagnosis. */
export const clipTimeStillVideoFragment = sealGraphFragment({
  inputs: [
    { name: "duration", type: speechTypes.duration },
    { name: "clock", type: programSpaceTypes.clock },
    { name: "source", type: artifactTypes.blob },
  ],
  operations: [
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
      inputs: { request: operation("plan"), source: input("source") },
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
