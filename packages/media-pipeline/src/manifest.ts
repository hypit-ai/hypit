import { artifactDependency } from "@narratage/artifact";
import { mediaDependency, mediaTypes } from "@narratage/media";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { speechDependency, speechTypes } from "@narratage/speech";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import { artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@narratage/protocol";

export const mediaPipelineModuleRef = { name: "@narratage/media-pipeline", version: "1" } as const;
export const mediaPipelineTypes = {
  selectionRequest: { module: mediaPipelineModuleRef, name: "MediaSelectionRequest" },
  audioProgramPlan: { module: mediaPipelineModuleRef, name: "AudioProgramPlan" },
  transformProgram: { module: mediaPipelineModuleRef, name: "MediaTransformProgram" },
  audioExtractionRequest: { module: mediaPipelineModuleRef, name: "AudioExtractionRequest" },
  frameExtractionRequest: { module: mediaPipelineModuleRef, name: "FrameExtractionRequest" },
} satisfies Record<string, TypeRef>;
export const mediaPipelineCapabilities = {
  inspect: { module: mediaPipelineModuleRef, name: "inspect-media" },
  normalize: { module: mediaPipelineModuleRef, name: "normalize-media" },
  transform: { module: mediaPipelineModuleRef, name: "transform-media" },
  extractAudio: { module: mediaPipelineModuleRef, name: "extract-media-audio" },
  extractFrame: { module: mediaPipelineModuleRef, name: "extract-media-frame" },
  projectSpeechEvidenceAudio: { module: mediaPipelineModuleRef, name: "project-speech-evidence-audio" },
  renderAudio: { module: mediaPipelineModuleRef, name: "render-timeline-audio" },
  mux: { module: mediaPipelineModuleRef, name: "mux-program-media" },
} satisfies Record<string, CapabilityRef>;
export const mediaPipelineProducers = {
  bindVisualRequest: { module: mediaPipelineModuleRef, name: "bind-visual-media-request-to-program" },
  bindAvRequest: { module: mediaPipelineModuleRef, name: "bind-av-media-request-to-program" },
  inspect: { module: mediaPipelineModuleRef, name: "request-media-inspection" },
  select: { module: mediaPipelineModuleRef, name: "select-media-streams" },
  normalize: { module: mediaPipelineModuleRef, name: "request-media-normalization" },
  transform: { module: mediaPipelineModuleRef, name: "request-media-transform" },
  extractAudio: { module: mediaPipelineModuleRef, name: "request-audio-extraction" },
  extractFrame: { module: mediaPipelineModuleRef, name: "request-frame-extraction" },
  projectSpeechEvidenceAudio: { module: mediaPipelineModuleRef, name: "request-speech-evidence-audio" },
  planAudio: { module: mediaPipelineModuleRef, name: "compile-audio-program" },
  renderAudio: { module: mediaPipelineModuleRef, name: "request-audio-render" },
  mux: { module: mediaPipelineModuleRef, name: "request-media-mux" },
  projectMuxed: { module: mediaPipelineModuleRef, name: "project-muxed-media" },
} satisfies Record<string, ProducerRef>;
export const mediaPipelineImplementationDigests = {
  bindVisualRequest: digestOf("@narratage/media-pipeline/bind-visual-media-request-to-program@1"),
  bindAvRequest: digestOf("@narratage/media-pipeline/bind-av-media-request-to-program@1"),
  inspect: digestOf("@narratage/media-pipeline/request-media-inspection@1"),
  select: digestOf("@narratage/media-pipeline/select-media-streams@1"),
  normalize: digestOf("@narratage/media-pipeline/request-media-normalization@1"),
  transform: digestOf("@narratage/media-pipeline/request-media-transform@1"),
  extractAudio: digestOf("@narratage/media-pipeline/request-audio-extraction@1"),
  extractFrame: digestOf("@narratage/media-pipeline/request-frame-extraction@1"),
  projectSpeechEvidenceAudio: digestOf("@narratage/media-pipeline/request-speech-evidence-audio@1"),
  requestValidator: digestOf("@narratage/media-pipeline/validate-selection-request@1"),
  planAudio: digestOf("@narratage/media-pipeline/compile-audio-program@1"),
  renderAudio: digestOf("@narratage/media-pipeline/request-audio-render@1"),
  mux: digestOf("@narratage/media-pipeline/request-media-mux@1"),
  projectMuxed: digestOf("@narratage/media-pipeline/project-muxed-media@1"),
  audioPlanValidator: digestOf("@narratage/media-pipeline/validate-audio-program-plan@1"),
  transformProgramValidator: digestOf("@narratage/media-pipeline/validate-media-transform-program@1"),
  audioExtractionValidator: digestOf("@narratage/media-pipeline/validate-audio-extraction-request@1"),
  frameExtractionValidator: digestOf("@narratage/media-pipeline/validate-frame-extraction-request@1"),
} as const;
export const synchronizedMediaSurfaceImplementationDigest = digestOf("@narratage/media-pipeline/synchronized-media-surface@1");
export const mediaOperationSurfaceImplementationDigests = {
  transform: digestOf("@narratage/media-pipeline/transform-media-surface@1"),
  extractAudio: digestOf("@narratage/media-pipeline/extract-audio-surface@1"),
  extractFrame: digestOf("@narratage/media-pipeline/extract-frame-surface@1"),
} as const;

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
    frameRate: { schema: {
      kind: "object",
      fields: {
        numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
        denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
      },
    } },
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
    startSec: { schema: nonNegativeNumber, optional: true },
    endSec: { schema: nonNegativeNumber, optional: true },
    tailSec: { schema: nonNegativeNumber, optional: true },
  },
};
const retimeOperationSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "retime" } },
    rate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } },
    pitch: { schema: { kind: "literal", value: "preserve" } },
  },
};
export const mediaTransformProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    operations: { schema: { kind: "array", minItems: 1, items: {
      kind: "oneOf", variants: [trimOperationSchema, retimeOperationSchema],
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

const blobRefSchema: ValueSchema = {
  kind: "object",
  fields: {
    kind: { schema: { kind: "literal", value: "blob" } },
    digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
    size: { schema: { kind: "number", integer: true, minimum: 0 } },
    mediaType: { schema: { kind: "literal", value: "audio/wav" } },
  },
};

export const audioProgramPlanSchema: ValueSchema = {
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
    sampleRate: { schema: { kind: "literal", value: 48_000 } },
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    clips: { schema: { kind: "array", items: {
      kind: "object",
      fields: {
        id: { schema: { kind: "string", minLength: 1 } },
        artifact: { schema: blobRefSchema },
        targetStartSample: { schema: integer },
        targetEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceSampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceStartSample: { schema: integer },
        sourceEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
        sourceLoop: { schema: { kind: "boolean" } },
        sourcePhaseSample: { schema: integer },
        playbackRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } },
        pitch: { schema: { kind: "literal", value: "preserve" } },
        gain: { schema: { kind: "number", minimum: 0, maximum: 64 } },
        fadeInSamples: { schema: integer },
        fadeOutSamples: { schema: integer },
      },
    } } },
    mix: { schema: {
      kind: "object",
      fields: {
        normalize: { schema: { kind: "literal", value: false } },
        limiter: { schema: { kind: "literal", value: "none" } },
      },
    } },
  },
};

export const mediaPipelineMarkupSurfaces = [
    {
      name: "synchronized-media", tag: "Normalize", mode: "structured",
      outputs: [mediaPipelineTypes.selectionRequest, mediaTypes.synchronized],
      implementation: { digest: synchronizedMediaSurfaceImplementationDigest },
    },
    {
      name: "transform-media", tag: "Transform", mode: "structured",
      outputs: [mediaPipelineTypes.selectionRequest, mediaPipelineTypes.transformProgram, artifactTypes.blob],
      implementation: { digest: mediaOperationSurfaceImplementationDigests.transform },
    },
    {
      name: "extract-audio", tag: "ExtractAudio", mode: "structured",
      outputs: [mediaPipelineTypes.audioExtractionRequest, artifactTypes.blob],
      implementation: { digest: mediaOperationSurfaceImplementationDigests.extractAudio },
    },
    {
      name: "extract-frame", tag: "ExtractFrame", mode: "structured",
      outputs: [mediaPipelineTypes.frameExtractionRequest, artifactTypes.blob],
      implementation: { digest: mediaOperationSurfaceImplementationDigests.extractFrame },
    },
  ] as const;


export const mediaPipelineManifest: ModuleManifest = {
  format: "svml.module@1",
  name: mediaPipelineModuleRef.name,
  version: mediaPipelineModuleRef.version,
  dependencies: [
    artifactDependency,
    mediaDependency,
    speechDependency,
    programSpaceDependency,
    compositionDependency,
  ],
  types: [
    {
      name: mediaPipelineTypes.selectionRequest.name,
      schema: mediaSelectionRequestSchema,
      validator: {
        implementation: {
          digest: mediaPipelineImplementationDigests.requestValidator,
        },
      },
    },
    {
      name: mediaPipelineTypes.audioProgramPlan.name,
      schema: audioProgramPlanSchema,
      validator: {
        implementation: {
          digest: mediaPipelineImplementationDigests.audioPlanValidator,
        },
      },
    },
    {
      name: mediaPipelineTypes.transformProgram.name,
      schema: mediaTransformProgramSchema,
      validator: {
        implementation: {
          digest: mediaPipelineImplementationDigests.transformProgramValidator,
        },
      },
    },
    {
      name: mediaPipelineTypes.audioExtractionRequest.name,
      schema: audioExtractionRequestSchema,
      validator: {
        implementation: {
          digest: mediaPipelineImplementationDigests.audioExtractionValidator,
        },
      },
    },
    {
      name: mediaPipelineTypes.frameExtractionRequest.name,
      schema: frameExtractionRequestSchema,
      validator: {
        implementation: {
          digest: mediaPipelineImplementationDigests.frameExtractionValidator,
        },
      },
    },
  ],
  capabilities: [
    { name: mediaPipelineCapabilities.inspect.name, returns: mediaTypes.inspection },
    { name: mediaPipelineCapabilities.normalize.name, returns: mediaTypes.synchronized },
    { name: mediaPipelineCapabilities.transform.name, returns: artifactTypes.blob },
    { name: mediaPipelineCapabilities.extractAudio.name, returns: artifactTypes.blob },
    { name: mediaPipelineCapabilities.extractFrame.name, returns: artifactTypes.blob },
    { name: mediaPipelineCapabilities.projectSpeechEvidenceAudio.name, returns: speechTypes.evidenceAudio },
    { name: mediaPipelineCapabilities.renderAudio.name, returns: mediaTypes.timelineAudio },
    { name: mediaPipelineCapabilities.mux.name, returns: mediaTypes.muxed },
  ],
  producers: [
    {
      name: mediaPipelineProducers.bindVisualRequest.name,
      inputs: [{ name: "space", type: programSpaceTypes.programSpace }],
      outputs: [{ name: "request", type: mediaPipelineTypes.selectionRequest }],
      needs: [],
      implementation: {
        digest: mediaPipelineImplementationDigests.bindVisualRequest,
      },
    },
    {
      name: mediaPipelineProducers.bindAvRequest.name,
      inputs: [{ name: "space", type: programSpaceTypes.programSpace }],
      outputs: [{ name: "request", type: mediaPipelineTypes.selectionRequest }],
      needs: [],
      implementation: {
        digest: mediaPipelineImplementationDigests.bindAvRequest,
      },
    },
    {
      name: mediaPipelineProducers.inspect.name,
      inputs: [{ name: "source", type: artifactTypes.blob }],
      outputs: [],
      needs: [{
        name: "inspection",
        capability: mediaPipelineCapabilities.inspect,
        returns: mediaTypes.inspection,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.inspect,
      },
    },
    {
      name: mediaPipelineProducers.select.name,
      inputs: [
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaPipelineTypes.selectionRequest },
      ],
      outputs: [{
        name: "selection",
        type: mediaTypes.streamSelection,
      }],
      needs: [],
      implementation: {
        digest: mediaPipelineImplementationDigests.select,
      },
    },
    {
      name: mediaPipelineProducers.normalize.name,
      inputs: [
        { name: "source", type: artifactTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "selection", type: mediaTypes.streamSelection },
        { name: "request", type: mediaPipelineTypes.selectionRequest },
      ],
      outputs: [],
      needs: [{
        name: "media",
        capability: mediaPipelineCapabilities.normalize,
        returns: mediaTypes.synchronized,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.normalize,
      },
    },
    {
      name: mediaPipelineProducers.transform.name,
      inputs: [
        { name: "media", type: mediaTypes.synchronized },
        { name: "program", type: mediaPipelineTypes.transformProgram },
      ],
      outputs: [],
      needs: [{
        name: "video",
        capability: mediaPipelineCapabilities.transform,
        returns: artifactTypes.blob,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.transform,
      },
    },
    {
      name: mediaPipelineProducers.extractAudio.name,
      inputs: [
        { name: "source", type: artifactTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaPipelineTypes.audioExtractionRequest },
      ],
      outputs: [],
      needs: [{
        name: "audio",
        capability: mediaPipelineCapabilities.extractAudio,
        returns: artifactTypes.blob,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.extractAudio,
      },
    },
    {
      name: mediaPipelineProducers.extractFrame.name,
      inputs: [
        { name: "source", type: artifactTypes.blob },
        { name: "inspection", type: mediaTypes.inspection },
        { name: "request", type: mediaPipelineTypes.frameExtractionRequest },
      ],
      outputs: [],
      needs: [{
        name: "image",
        capability: mediaPipelineCapabilities.extractFrame,
        returns: artifactTypes.blob,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.extractFrame,
      },
    },
    {
      name: mediaPipelineProducers.projectSpeechEvidenceAudio.name,
      inputs: [{ name: "audio", type: speechTypes.audioBasis }],
      outputs: [],
      needs: [{
        name: "evidenceAudio",
        capability: mediaPipelineCapabilities.projectSpeechEvidenceAudio,
        returns: speechTypes.evidenceAudio,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.projectSpeechEvidenceAudio,
      },
    },
    {
      name: mediaPipelineProducers.planAudio.name,
      inputs: [
        { name: "composition", type: compositionTypes.composition },
        { name: "space", type: programSpaceTypes.programSpace },
      ],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
      implementation: {
        digest: mediaPipelineImplementationDigests.planAudio,
      },
    },
    {
      name: mediaPipelineProducers.renderAudio.name,
      inputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      outputs: [],
      needs: [{
        name: "audio",
        capability: mediaPipelineCapabilities.renderAudio,
        returns: mediaTypes.timelineAudio,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.renderAudio,
      },
    },
    {
      name: mediaPipelineProducers.mux.name,
      inputs: [
        { name: "visual", type: mediaTypes.renderedVisual },
        { name: "audio", type: mediaTypes.timelineAudio },
      ],
      outputs: [],
      needs: [{
        name: "media",
        capability: mediaPipelineCapabilities.mux,
        returns: mediaTypes.muxed,
      }],
      implementation: {
        digest: mediaPipelineImplementationDigests.mux,
      },
    },
    {
      name: mediaPipelineProducers.projectMuxed.name,
      inputs: [{ name: "media", type: mediaTypes.muxed }],
      outputs: [{ name: "video", type: artifactTypes.blob }],
      needs: [],
      implementation: {
        digest: mediaPipelineImplementationDigests.projectMuxed,
      },
    },
  ],
};

export const mediaPipelineManifestDigest = digestOf(mediaPipelineManifest);
