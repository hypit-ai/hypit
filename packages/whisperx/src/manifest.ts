import {
  alignedTranscriptEvidenceFields,
  contractTypes,
  videoContractDependencies,
} from "@svml/contracts";
import { digestOf } from "@svml/core";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

export const whisperXModuleRef = { name: "@svml/whisperx", version: "0.0.0-dev" } as const;
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
  request: digestOf("@svml/whisperx/request@1"),
  normalize: digestOf("@svml/whisperx/normalize@1"),
};

const { contract: _commonContract, evidenceDigest: _commonDigest, ...sharedEvidenceFields } =
  alignedTranscriptEvidenceFields;
export const whisperXAlignmentEvidenceSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.whisperx-alignment-evidence@1" } },
    engine: { schema: { kind: "literal", value: "whisperx" } },
    ...sharedEvidenceFields,
    alignmentDigest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
  },
};

export const whisperXManifest: ModuleManifest = {
  format: "svml.module@0",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [
    videoContractDependencies.speech,
    videoContractDependencies.semanticTime,
  ],
  types: [{ name: whisperXTypes.alignmentEvidence.name, schema: whisperXAlignmentEvidenceSchema }],
  capabilities: [{
    name: whisperXCapabilities.alignment.name,
    returns: whisperXTypes.alignmentEvidence,
  }],
  surfaces: [],
  producers: [
    {
      name: whisperXProducers.request.name,
      inputs: [{ name: "audio", type: contractTypes.speechAudioBasis }],
      outputs: [],
      needs: [{
        name: "alignment",
        capability: whisperXCapabilities.alignment,
        returns: whisperXTypes.alignmentEvidence,
        affinity: [
          { resultPointer: "/basisDigest", input: "audio", inputPointer: "/basisDigest" },
          { resultPointer: "/audioArtifactDigest", input: "audio", inputPointer: "/audio/digest" },
          { resultPointer: "/programSpaceDigest", input: "audio", inputPointer: "/programSpace/digest" },
        ],
      }],
      implementation: {
        kind: "registered",
        locator: "@svml/whisperx/request",
        digest: whisperXImplementationDigests.request,
      },
    },
    {
      name: whisperXProducers.normalize.name,
      inputs: [{ name: "whisperx", type: whisperXTypes.alignmentEvidence }],
      outputs: [{
        name: "evidence",
        type: contractTypes.alignedTranscriptEvidence,
        affinity: [
          { resultPointer: "/basisDigest", input: "whisperx", inputPointer: "/basisDigest" },
          { resultPointer: "/audioArtifactDigest", input: "whisperx", inputPointer: "/audioArtifactDigest" },
          { resultPointer: "/programSpaceDigest", input: "whisperx", inputPointer: "/programSpaceDigest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/whisperx/normalize",
        digest: whisperXImplementationDigests.normalize,
      },
    },
  ],
};
