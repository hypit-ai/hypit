import { artifactDependency, artifactTypes } from "@narratage/artifact";
import {
  contractTypes,
  videoContractDependencies,
} from "@narratage/contracts";
import { digestOf } from "@narratage/protocol";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@narratage/protocol";

export const mediaPipelineModuleRef = { name: "@narratage/media-pipeline", version: "0.0.0-dev" } as const;
export const mediaPipelineTypes = {
  selectionRequest: { module: mediaPipelineModuleRef, name: "MediaSelectionRequest" },
  audioProgramPlan: { module: mediaPipelineModuleRef, name: "AudioProgramPlan" },
} satisfies Record<string, TypeRef>;
export const mediaPipelineCapabilities = {
  inspect: { module: mediaPipelineModuleRef, name: "inspect-media" },
  normalize: { module: mediaPipelineModuleRef, name: "normalize-media" },
  projectSpeechEvidenceAudio: { module: mediaPipelineModuleRef, name: "project-speech-evidence-audio" },
  renderAudio: { module: mediaPipelineModuleRef, name: "render-timeline-audio" },
  mux: { module: mediaPipelineModuleRef, name: "mux-program-media" },
} satisfies Record<string, CapabilityRef>;
export const mediaPipelineProducers = {
  inspect: { module: mediaPipelineModuleRef, name: "request-media-inspection" },
  select: { module: mediaPipelineModuleRef, name: "select-media-streams" },
  normalize: { module: mediaPipelineModuleRef, name: "request-media-normalization" },
  projectSpeechEvidenceAudio: { module: mediaPipelineModuleRef, name: "request-speech-evidence-audio" },
  planAudio: { module: mediaPipelineModuleRef, name: "compile-audio-program" },
  renderAudio: { module: mediaPipelineModuleRef, name: "request-audio-render" },
  mux: { module: mediaPipelineModuleRef, name: "request-media-mux" },
  projectMuxed: { module: mediaPipelineModuleRef, name: "project-muxed-media" },
} satisfies Record<string, ProducerRef>;
export const mediaPipelineImplementationDigests = {
  inspect: digestOf("@narratage/media-pipeline/request-media-inspection@1"),
  select: digestOf("@narratage/media-pipeline/select-media-streams@1"),
  normalize: digestOf("@narratage/media-pipeline/request-media-normalization@1"),
  projectSpeechEvidenceAudio: digestOf("@narratage/media-pipeline/request-speech-evidence-audio@1"),
  requestValidator: digestOf("@narratage/media-pipeline/validate-selection-request@1"),
  planAudio: digestOf("@narratage/media-pipeline/compile-audio-program@1"),
  renderAudio: digestOf("@narratage/media-pipeline/request-audio-render@1"),
  mux: digestOf("@narratage/media-pipeline/request-media-mux@1"),
  projectMuxed: digestOf("@narratage/media-pipeline/project-muxed-media@1"),
  audioPlanValidator: digestOf("@narratage/media-pipeline/validate-audio-program-plan@1"),
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
    contract: { schema: { kind: "literal", value: "svml.media-selection-request@1" } },
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
    contract: { schema: { kind: "literal", value: "svml.audio-program-plan@1" } },
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
        sourceStartSample: { schema: integer },
        playbackRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } },
        gain: { schema: { kind: "number", minimum: 0, maximum: 64 } },
        fadeInSamples: { schema: integer },
        fadeOutSamples: { schema: integer },
        bus: { schema: { kind: "string", enum: ["speech", "music", "sfx", "source"] } },
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

export const mediaPipelineManifest: ModuleManifest = {
  format: "svml.module@1",
  name: mediaPipelineModuleRef.name,
  version: mediaPipelineModuleRef.version,
  dependencies: [
    artifactDependency,
    videoContractDependencies.media,
    videoContractDependencies.speech,
    videoContractDependencies.programSpace,
    videoContractDependencies.composition,
  ],
  types: [
    {
      name: mediaPipelineTypes.selectionRequest.name,
      schema: mediaSelectionRequestSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@narratage/media-pipeline/validate-selection-request",
          digest: mediaPipelineImplementationDigests.requestValidator,
        },
      },
    },
    {
      name: mediaPipelineTypes.audioProgramPlan.name,
      schema: audioProgramPlanSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@narratage/media-pipeline/validate-audio-program-plan",
          digest: mediaPipelineImplementationDigests.audioPlanValidator,
        },
      },
    },
  ],
  capabilities: [
    { name: mediaPipelineCapabilities.inspect.name, returns: contractTypes.mediaInspection },
    { name: mediaPipelineCapabilities.normalize.name, returns: contractTypes.synchronizedMedia },
    { name: mediaPipelineCapabilities.projectSpeechEvidenceAudio.name, returns: contractTypes.speechEvidenceAudio },
    { name: mediaPipelineCapabilities.renderAudio.name, returns: contractTypes.timelineAudio },
    { name: mediaPipelineCapabilities.mux.name, returns: contractTypes.muxedMedia },
  ],
  surfaces: [],
  producers: [
    {
      name: mediaPipelineProducers.inspect.name,
      inputs: [{ name: "source", type: artifactTypes.blob }],
      outputs: [],
      needs: [{
        name: "inspection",
        capability: mediaPipelineCapabilities.inspect,
        returns: contractTypes.mediaInspection,
      }],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/request-media-inspection",
        digest: mediaPipelineImplementationDigests.inspect,
      },
    },
    {
      name: mediaPipelineProducers.select.name,
      inputs: [
        { name: "inspection", type: contractTypes.mediaInspection },
        { name: "request", type: mediaPipelineTypes.selectionRequest },
      ],
      outputs: [{
        name: "selection",
        type: contractTypes.mediaStreamSelection,
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/select-media-streams",
        digest: mediaPipelineImplementationDigests.select,
      },
    },
    {
      name: mediaPipelineProducers.normalize.name,
      inputs: [
        { name: "source", type: artifactTypes.blob },
        { name: "inspection", type: contractTypes.mediaInspection },
        { name: "selection", type: contractTypes.mediaStreamSelection },
        { name: "request", type: mediaPipelineTypes.selectionRequest },
      ],
      outputs: [],
      needs: [{
        name: "media",
        capability: mediaPipelineCapabilities.normalize,
        returns: contractTypes.synchronizedMedia,
      }],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/request-media-normalization",
        digest: mediaPipelineImplementationDigests.normalize,
      },
    },
    {
      name: mediaPipelineProducers.projectSpeechEvidenceAudio.name,
      inputs: [{ name: "audio", type: contractTypes.speechAudioBasis }],
      outputs: [],
      needs: [{
        name: "evidenceAudio",
        capability: mediaPipelineCapabilities.projectSpeechEvidenceAudio,
        returns: contractTypes.speechEvidenceAudio,
      }],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/request-speech-evidence-audio",
        digest: mediaPipelineImplementationDigests.projectSpeechEvidenceAudio,
      },
    },
    {
      name: mediaPipelineProducers.planAudio.name,
      inputs: [
        { name: "composition", type: contractTypes.composition },
        { name: "space", type: contractTypes.programSpace },
      ],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/compile-audio-program",
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
        returns: contractTypes.timelineAudio,
      }],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/request-audio-render",
        digest: mediaPipelineImplementationDigests.renderAudio,
      },
    },
    {
      name: mediaPipelineProducers.mux.name,
      inputs: [
        { name: "visual", type: contractTypes.renderedVisual },
        { name: "audio", type: contractTypes.timelineAudio },
      ],
      outputs: [],
      needs: [{
        name: "media",
        capability: mediaPipelineCapabilities.mux,
        returns: contractTypes.muxedMedia,
      }],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/request-media-mux",
        digest: mediaPipelineImplementationDigests.mux,
      },
    },
    {
      name: mediaPipelineProducers.projectMuxed.name,
      inputs: [{ name: "media", type: contractTypes.muxedMedia }],
      outputs: [{ name: "video", type: contractTypes.mediaArtifact }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/media-pipeline/project-muxed-media",
        digest: mediaPipelineImplementationDigests.projectMuxed,
      },
    },
  ],
};

export const mediaPipelineManifestDigest = digestOf(mediaPipelineManifest);
