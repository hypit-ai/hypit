import { blobDependency } from "@hypit/hypit/blob";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { frameSpanSchema, timelineDependency, timelineTypes } from "@hypit/timeline";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { blobTypes } from "@hypit/hypit/blob";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const mediaOperationsModuleRef = { name: "@hypit/media-operations", version: "1" } as const;
export const mediaOperationsTypes = {
  audioExtractionRequest: { module: mediaOperationsModuleRef, name: "AudioExtractionRequest" },
  frameExtractionRequest: { module: mediaOperationsModuleRef, name: "FrameExtractionRequest" },
  stillVideoRequest: { module: mediaOperationsModuleRef, name: "StillVideoRequest" },
  stillVideoLayout: { module: mediaOperationsModuleRef, name: "StillVideoLayout" },
} satisfies Record<string, TypeRef>;
export const mediaOperationsCapabilities = {
  extractAudio: { module: mediaOperationsModuleRef, name: "extract-media-audio" },
  extractFrame: { module: mediaOperationsModuleRef, name: "extract-media-frame" },
  renderStill: { module: mediaOperationsModuleRef, name: "render-still-video" },
} satisfies Record<string, CapabilityRef>;
export const mediaOperationsProducers = {
  extractAudio: { module: mediaOperationsModuleRef, name: "request-audio-extraction" },
  extractFrame: { module: mediaOperationsModuleRef, name: "request-frame-extraction" },
  planStill: { module: mediaOperationsModuleRef, name: "plan-still-video" },
  renderStill: { module: mediaOperationsModuleRef, name: "request-still-video" },
  bindStill: { module: mediaOperationsModuleRef, name: "bind-still-video-source" },
} satisfies Record<string, ProducerRef>;

const integer = { kind: "number", integer: true, minimum: 0 } as const;
const mode = (name: string): ValueSchema => ({
  kind: "object",
  fields: { mode: { schema: { kind: "literal", value: name } } },
});
const streamMode: ValueSchema = {
  kind: "object",
  fields: {
    mode: { schema: { kind: "literal", value: "stream-index" } },
    streamIndex: { schema: integer },
  },
};
const videoSelectorSchema: ValueSchema = {
  kind: "oneOf",
  variants: [mode("primary-moving"), streamMode],
};
const audioSelectorSchema: ValueSchema = {
  kind: "oneOf",
  variants: [mode("default"), streamMode],
};
const nonNegativeNumber = { kind: "number", minimum: 0 } as const;
export const audioExtractionRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    audio: { schema: audioSelectorSchema },
  },
};
export const frameExtractionRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    video: { schema: videoSelectorSchema },
    at: { schema: { kind: "oneOf", variants: [
      { kind: "object", fields: { kind: { schema: { kind: "literal", value: "first" } } } },
      { kind: "object", fields: { kind: { schema: { kind: "literal", value: "last" } } } },
      { kind: "object", fields: {
        kind: { schema: { kind: "literal", value: "frame" } },
        index: { schema: integer },
      } },
      { kind: "object", fields: {
        kind: { schema: { kind: "literal", value: "time" } },
        seconds: { schema: nonNegativeNumber },
      } },
    ] } },
  },
};

export const stillVideoRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    frameRate: { schema: {
      kind: "object",
      fields: {
        numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
        denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
      },
    } },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
    segments: { schema: { kind: "array", items: {
      kind: "object",
      fields: {
        ...(frameSpanSchema.kind === "object" ? frameSpanSchema.fields : {}),
        source: { optional: true, schema: blobRefSchema() },
      },
    } } },
  },
};

export const stillVideoLayoutSchema: ValueSchema = {
  kind: "object",
  fields: {
    weights: { schema: { kind: "array", items: { kind: "number", minimum: 0 } } },
  },
};


export const mediaOperationsManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: mediaOperationsModuleRef.name,
  version: mediaOperationsModuleRef.version,
  dependencies: [
    blobDependency,
    mediaDependency,
    timelineDependency,
    temporalDependency,
  ],
  types: [
    mediaOperationsTypes.audioExtractionRequest.name,
    mediaOperationsTypes.frameExtractionRequest.name,
    mediaOperationsTypes.stillVideoRequest.name,
    mediaOperationsTypes.stillVideoLayout.name,
  ],
  capabilities: [
    { name: mediaOperationsCapabilities.extractAudio.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.extractFrame.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.renderStill.name, returns: blobTypes.blob },
  ],
  producers: [
    {
      name: mediaOperationsProducers.extractAudio.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaOperationsTypes.audioExtractionRequest },
      ],
      result: { kind: "need" as const, name: "audio", capability: mediaOperationsCapabilities.extractAudio },
    },
    {
      name: mediaOperationsProducers.extractFrame.name,
      inputs: [
        { name: "source", type: blobTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaOperationsTypes.frameExtractionRequest },
      ],
      result: { kind: "need" as const, name: "image", capability: mediaOperationsCapabilities.extractFrame },
    },
    {
      name: mediaOperationsProducers.planStill.name,
      inputs: [
        { name: "duration", type: temporalTypes.duration },
        { name: "clock", type: timelineTypes.clock },
        { name: "layout", type: mediaOperationsTypes.stillVideoLayout },
      ],
      result: { kind: "output" as const, name: "request", type: mediaOperationsTypes.stillVideoRequest },
    },
    {
      name: mediaOperationsProducers.bindStill.name,
      inputs: [
        { name: "request", type: mediaOperationsTypes.stillVideoRequest },
        { name: "source", type: blobTypes.blob },
      ],
      result: { kind: "output" as const, name: "request", type: mediaOperationsTypes.stillVideoRequest },
    },
    {
      name: mediaOperationsProducers.renderStill.name,
      inputs: [
        { name: "request", type: mediaOperationsTypes.stillVideoRequest },
      ],
      result: { kind: "need" as const, name: "video", capability: mediaOperationsCapabilities.renderStill },
    },
  ],
};
