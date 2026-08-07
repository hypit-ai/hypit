import {
  alignedTranscriptEvidenceFields,
  contractTypes,
  videoContractDependencies,
} from "@narratage/video-contracts";
import { digestOf } from "@narratage/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { mediaPipelineManifest, mediaPipelineModuleRef } from "@narratage/media-pipeline";
import { speechAlignManifest, speechAlignModuleRef } from "@narratage/speech-align";

export const whisperXModuleRef = { name: "@narratage/whisperx", version: "0.0.0-dev" } as const;
export const whisperXTypes = {
  alignmentEvidence: { module: whisperXModuleRef, name: "WhisperXAlignmentEvidence" },
} satisfies Record<string, TypeRef>;
export const whisperXCapabilities = {
  alignment: { module: whisperXModuleRef, name: "whisperx-alignment" },
} satisfies Record<string, CapabilityRef>;
export const whisperXProducers = {
  request: { module: whisperXModuleRef, name: "request-whisperx-alignment" },
  normalize: { module: whisperXModuleRef, name: "normalize-whisperx-alignment" },
} satisfies Record<string, ProducerRef>;
export const whisperXImplementationDigests = {
  request: digestOf("@narratage/whisperx/request@2"),
  normalize: digestOf("@narratage/whisperx/normalize@2"),
  surface: digestOf("@narratage/whisperx/alignment-surface@1"),
};

const { contract: _commonContract, ...sharedEvidenceFields } =
  alignedTranscriptEvidenceFields;
export const whisperXAlignmentEvidenceSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.whisperx-alignment-evidence@1" } },
    ...sharedEvidenceFields,
  },
};

export const whisperXManifest: ModuleManifest = {
  format: "svml.module@1",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [
    videoContractDependencies.speech,
    videoContractDependencies.semanticTime,
    { module: mediaPipelineModuleRef, digest: digestOf(mediaPipelineManifest) },
    { module: speechAlignModuleRef, digest: digestOf(speechAlignManifest) },
  ],
  types: [{ name: whisperXTypes.alignmentEvidence.name, schema: whisperXAlignmentEvidenceSchema }],
  capabilities: [{
    name: whisperXCapabilities.alignment.name,
    returns: whisperXTypes.alignmentEvidence,
  }],
  surfaces: [{
    name: "alignment",
    tag: "Alignment",
    mode: "structured",
    outputs: [whisperXTypes.alignmentEvidence, contractTypes.alignedTranscriptEvidence, contractTypes.completeSemanticMap],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/whisperx/alignment-surface",
      digest: whisperXImplementationDigests.surface,
    },
  }],
  producers: [
    {
      name: whisperXProducers.request.name,
      inputs: [{ name: "audio", type: contractTypes.speechEvidenceAudio }],
      outputs: [],
      needs: [{
        name: "alignment",
        capability: whisperXCapabilities.alignment,
        returns: whisperXTypes.alignmentEvidence,
      }],
      implementation: {
        kind: "registered",
        locator: "@narratage/whisperx/request",
        digest: whisperXImplementationDigests.request,
      },
    },
    {
      name: whisperXProducers.normalize.name,
      inputs: [{ name: "whisperx", type: whisperXTypes.alignmentEvidence }],
      outputs: [{ name: "evidence", type: contractTypes.alignedTranscriptEvidence }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/whisperx/normalize",
        digest: whisperXImplementationDigests.normalize,
      },
    },
  ],
};
