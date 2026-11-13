import { mediaProducers, mediaTypes } from "@hypit/media";
import { temporalProducers, temporalTypes } from "@hypit/temporal";
import { blobTypes } from "@hypit/hypit/blob";
import { timelineTypes } from "@hypit/timeline";
import { sealGraphFragment } from "@hypit/hypit/author";

import {
  mediaOperationsProducers,
  mediaOperationsTypes,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const synchronizedMediaFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: blobTypes.blob },
    { name: "request", type: mediaOperationsTypes.selectionRequest },
    { name: "domain", type: mediaTypes.domainSpec },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaOperationsProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection" },
    },
    {
      id: "select",
      producer: mediaOperationsProducers.select,
      inputs: { inspection: operation("inspect"), request: input("request") },
      result: { kind: "output", name: "selection" },
    },
    {
      id: "normalize",
      producer: mediaOperationsProducers.normalize,
      inputs: {
        source: input("source"),
        inspection: operation("inspect"),
        selection: operation("select"),
        request: input("request"),
      },
      result: { kind: "need", name: "media" },
    },
    {
      id: "domain",
      producer: mediaProducers.localDomain,
      inputs: { media: operation("normalize"), spec: input("domain") },
      result: { kind: "output", name: "domain" },
    },
    {
      id: "extent",
      producer: temporalProducers.extentFromDomain,
      inputs: { domain: operation("domain") },
      result: { kind: "output", name: "extent" },
    },
  ],
  exports: [{
    name: "media",
    type: mediaTypes.synchronized,
    root: operation("normalize"),
  }, {
    name: "domain",
    type: temporalTypes.localDomain,
    root: operation("domain"),
  }, {
    name: "extent",
    type: temporalTypes.extent,
    root: operation("extent"),
  }],
});

export const transformMediaFragment = sealGraphFragment({
  inputs: [
    { name: "media", type: mediaTypes.synchronized },
    { name: "program", type: mediaOperationsTypes.transformProgram },
  ],
  operations: [
    {
      id: "transform",
      producer: mediaOperationsProducers.transform,
      inputs: { media: input("media"), program: input("program") },
      result: { kind: "need", name: "video" },
    },
  ],
  exports: [{
    name: "video",
    type: blobTypes.blob,
    root: operation("transform"),
  }],
});

/**
 * Composite a subject over a rendered layer. Both operands are Blobs, so no inspection or domain
 * Record stands between them: the executor probes what it needs and the under layer decides the
 * frame size and duration.
 */
export const compositeMediaFragment = sealGraphFragment({
  inputs: [
    { name: "under", type: blobTypes.blob },
    { name: "over", type: blobTypes.blob },
  ],
  operations: [
    {
      id: "composite",
      producer: mediaOperationsProducers.composite,
      inputs: { under: input("under"), over: input("over") },
      result: { kind: "need", name: "video" },
    },
  ],
  exports: [{
    name: "video",
    type: blobTypes.blob,
    root: operation("composite"),
  }],
});

export const extractAudioFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: blobTypes.blob },
    { name: "request", type: mediaOperationsTypes.audioExtractionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaOperationsProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection" },
    },
    {
      id: "extract",
      producer: mediaOperationsProducers.extractAudio,
      inputs: { source: input("source"), inspection: operation("inspect"), request: input("request") },
      result: { kind: "need", name: "audio" },
    },
  ],
  exports: [{
    name: "audio",
    type: blobTypes.blob,
    root: operation("extract"),
  }],
});

export const extractFrameFragment = sealGraphFragment({
  inputs: [
    { name: "source", type: blobTypes.blob },
    { name: "request", type: mediaOperationsTypes.frameExtractionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaOperationsProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection" },
    },
    {
      id: "extract",
      producer: mediaOperationsProducers.extractFrame,
      inputs: { source: input("source"), inspection: operation("inspect"), request: input("request") },
      result: { kind: "need", name: "image" },
    },
  ],
  exports: [{
    name: "image",
    type: blobTypes.blob,
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
      { name: "duration", type: temporalTypes.duration },
      { name: "clock", type: timelineTypes.clock },
      { name: "layout", type: mediaOperationsTypes.stillVideoLayout },
      ...sources.map((name) => ({ name, type: blobTypes.blob })),
    ],
    operations: [
      {
        id: "plan",
        producer: mediaOperationsProducers.planStill,
        inputs: { duration: input("duration"), clock: input("clock"), layout: input("layout") },
        result: { kind: "output", name: "request" },
      },
      ...sources.map((name, index) => ({
        id: `bind-${index}`,
        producer: mediaOperationsProducers.bindStill,
        inputs: { request: operation(index === 0 ? "plan" : `bind-${index - 1}`), source: input(name) },
        result: { kind: "output" as const, name: "request" },
      })),
      {
        id: "render",
        producer: mediaOperationsProducers.renderStill,
        inputs: { request: operation(`bind-${count - 1}`) },
        result: { kind: "need", name: "video" },
      },
    ],
    exports: [{
      name: "video",
      type: blobTypes.blob,
      root: operation("render"),
    }],
  });
}

export const stillVideoFragment = createStillVideoFragment(1);
