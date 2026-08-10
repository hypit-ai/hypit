import { mediaTypes } from "@narratage/media";
import { artifactTypes } from "@narratage/artifact";
import { sealGraphFragment } from "@narratage/elaborator";

import {
  mediaPipelineProducers,
  mediaPipelineTypes,
} from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export const synchronizedMediaFragment = sealGraphFragment({
  name: "@narratage/media-pipeline/synchronized-media@1",
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "request", type: mediaPipelineTypes.selectionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection", accepts: "exact" },
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
      result: { kind: "need", name: "media", accepts: "exact" },
    },
  ],
  exports: [{
    name: "media",
    type: mediaTypes.synchronized,
    root: operation("normalize"),
    semanticInputs: ["request", "source"],
    fidelity: "exact",
  }],
});

export const transformMediaFragment = sealGraphFragment({
  name: "@narratage/media-pipeline/transform-media@1",
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "selection", type: mediaPipelineTypes.selectionRequest },
    { name: "program", type: mediaPipelineTypes.transformProgram },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection", accepts: "exact" },
    },
    {
      id: "select",
      producer: mediaPipelineProducers.select,
      inputs: { inspection: operation("inspect"), request: input("selection") },
      result: { kind: "output", name: "selection" },
    },
    {
      id: "normalize",
      producer: mediaPipelineProducers.normalize,
      inputs: {
        source: input("source"),
        inspection: operation("inspect"),
        selection: operation("select"),
        request: input("selection"),
      },
      result: { kind: "need", name: "media", accepts: "exact" },
    },
    {
      id: "transform",
      producer: mediaPipelineProducers.transform,
      inputs: { media: operation("normalize"), program: input("program") },
      result: { kind: "need", name: "video", accepts: "exact" },
    },
  ],
  exports: [{
    name: "video",
    type: artifactTypes.blob,
    root: operation("transform"),
    semanticInputs: ["program", "selection", "source"],
    fidelity: "exact",
  }],
});

export const extractAudioFragment = sealGraphFragment({
  name: "@narratage/media-pipeline/extract-audio@1",
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "request", type: mediaPipelineTypes.audioExtractionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection", accepts: "exact" },
    },
    {
      id: "extract",
      producer: mediaPipelineProducers.extractAudio,
      inputs: { source: input("source"), inspection: operation("inspect"), request: input("request") },
      result: { kind: "need", name: "audio", accepts: "exact" },
    },
  ],
  exports: [{
    name: "audio",
    type: artifactTypes.blob,
    root: operation("extract"),
    semanticInputs: ["request", "source"],
    fidelity: "exact",
  }],
});

export const extractFrameFragment = sealGraphFragment({
  name: "@narratage/media-pipeline/extract-frame@1",
  inputs: [
    { name: "source", type: artifactTypes.blob },
    { name: "request", type: mediaPipelineTypes.frameExtractionRequest },
  ],
  operations: [
    {
      id: "inspect",
      producer: mediaPipelineProducers.inspect,
      inputs: { source: input("source") },
      result: { kind: "need", name: "inspection", accepts: "exact" },
    },
    {
      id: "extract",
      producer: mediaPipelineProducers.extractFrame,
      inputs: { source: input("source"), inspection: operation("inspect"), request: input("request") },
      result: { kind: "need", name: "image", accepts: "exact" },
    },
  ],
  exports: [{
    name: "image",
    type: artifactTypes.blob,
    root: operation("extract"),
    semanticInputs: ["request", "source"],
    fidelity: "exact",
  }],
});
