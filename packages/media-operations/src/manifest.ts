import { blobDependency } from "@hypit/hypit/blob";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { frameSpanSchema, timelineDependency, timelineTypes } from "@hypit/timeline";
import { recipeModuleRef, recipeType } from "@hypit/hypit/recipe";
import { exactTemporalValueSchema, temporalDependency, temporalRateSchema, temporalTypes } from "@hypit/temporal";
import { blobTypes } from "@hypit/hypit/blob";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const mediaOperationsModuleRef = { name: "@hypit/media-operations", version: "1" } as const;
export const mediaOperationsTypes = {
  selectionRequest: { module: mediaOperationsModuleRef, name: "MediaSelectionRequest" },
  transformProgram: { module: mediaOperationsModuleRef, name: "MediaTransformProgram" },
  audioExtractionRequest: { module: mediaOperationsModuleRef, name: "AudioExtractionRequest" },
  frameExtractionRequest: { module: mediaOperationsModuleRef, name: "FrameExtractionRequest" },
  stillVideoRequest: { module: mediaOperationsModuleRef, name: "StillVideoRequest" },
  stillVideoLayout: { module: mediaOperationsModuleRef, name: "StillVideoLayout" },
} satisfies Record<string, TypeRef>;
export const mediaOperationsCapabilities = {
  inspect: { module: mediaOperationsModuleRef, name: "inspect-media" },
  extractAudio: { module: mediaOperationsModuleRef, name: "extract-media-audio" },
  extractFrame: { module: mediaOperationsModuleRef, name: "extract-media-frame" },
  renderStill: { module: mediaOperationsModuleRef, name: "render-still-video" },
} satisfies Record<string, CapabilityRef>;
export const mediaOperationsProducers = {
  inspect: { module: mediaOperationsModuleRef, name: "request-media-inspection" },
  select: { module: mediaOperationsModuleRef, name: "select-media-streams" },
  transform: { module: mediaOperationsModuleRef, name: "transform-prepared-media" },
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
export const mediaSelectionRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    video: { schema: { kind: "oneOf", variants: [mode("primary-moving"), streamMode, mode("none")] } },
    audio: { schema: { kind: "oneOf", variants: [mode("default"), streamMode, mode("none")] } },
    spanAuthority: { schema: { kind: "string", enum: ["video", "audio"] } },
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
const trimOperationSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "trim" } },
    start: { schema: exactTemporalValueSchema, optional: true },
    end: { schema: exactTemporalValueSchema, optional: true },
    tail: { schema: exactTemporalValueSchema, optional: true },
  },
};
const retimeOperationSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "retime" } },
    rate: { schema: temporalRateSchema },
  },
};
const transformRelativePointSchema: ValueSchema = {
  kind: "object",
  fields: {
    edge: { schema: { kind: "string", enum: ["start", "end"] } },
    offset: { schema: exactTemporalValueSchema },
  },
};
const retimeProfileOperationSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "retime-profile" } },
    knots: { schema: { kind: "array", minItems: 2, items: {
      kind: "object",
      fields: {
        at: { schema: transformRelativePointSchema },
        rate: { schema: temporalRateSchema },
      },
    } } },
  },
};
export const mediaTransformProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    operations: { schema: { kind: "array", minItems: 1, items: {
      kind: "oneOf", variants: [trimOperationSchema, retimeOperationSchema, retimeProfileOperationSchema],
    } } },
  },
};
export const audioExtractionRequestSchema: ValueSchema = {
  kind: "object",
  fields: {
    audio: { schema: audioSelectorSchema },
    output: { schema: {
      kind: "object",
      fields: {
        container: { schema: { kind: "literal", value: "wav" } },
        codec: { schema: { kind: "literal", value: "pcm_s16le" } },
        sampleRate: { schema: { kind: "literal", value: 48_000 } },
        channels: { schema: { kind: "literal", value: 2 } },
      },
    } },
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
    output: { schema: {
      kind: "object",
      fields: { format: { schema: { kind: "literal", value: "png" } } },
    } },
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
    output: { schema: {
      kind: "object",
      fields: {
        container: { schema: { kind: "literal", value: "mp4" } },
        codec: { schema: { kind: "literal", value: "h264" } },
        pixelFormat: { schema: { kind: "literal", value: "yuv420p" } },
      },
    } },
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
    recipeModuleRef,
  ],
  types: [
    mediaOperationsTypes.selectionRequest.name,
    mediaOperationsTypes.transformProgram.name,
    mediaOperationsTypes.audioExtractionRequest.name,
    mediaOperationsTypes.frameExtractionRequest.name,
    mediaOperationsTypes.stillVideoRequest.name,
    mediaOperationsTypes.stillVideoLayout.name,
  ],
  capabilities: [
    { name: mediaOperationsCapabilities.inspect.name, returns: mediaTypes.inspection },
    { name: mediaOperationsCapabilities.extractAudio.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.extractFrame.name, returns: blobTypes.blob },
    { name: mediaOperationsCapabilities.renderStill.name, returns: blobTypes.blob },
  ],
  producers: [
    {
      name: mediaOperationsProducers.inspect.name,
      inputs: [{ name: "source", type: blobTypes.blob }],
      result: { kind: "need" as const, name: "inspection", capability: mediaOperationsCapabilities.inspect },
    },
    {
      name: mediaOperationsProducers.select.name,
      inputs: [
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaOperationsTypes.selectionRequest },
      ],
      result: { kind: "output" as const, name: "selection", type: mediaTypes.streamSelection },
    },
    {
      name: mediaOperationsProducers.transform.name,
      inputs: [
        { name: "media", type: mediaTypes.prepared },
        { name: "program", type: mediaOperationsTypes.transformProgram },
        { name: "spec", type: mediaTypes.domainSpec },
      ],
      result: { kind: "output" as const, name: "media", type: mediaTypes.prepared },
    },
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
