import {
  alignedTranscriptEvidenceFields,
  contractTypes,
  contractsManifestDigest,
  contractsModuleRef,
} from "@svml/contracts";
import { digestOf } from "@svml/core";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

export const whisperXModuleRef = { name: "@svml/whisperx", version: "0.0.0-dev" } as const;
export const whisperXTypes = {
  alignmentEvidence: { module: whisperXModuleRef, name: "WhisperXAlignmentEvidence" },
} satisfies Record<string, TypeRef>;
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
  dependencies: [{ module: contractsModuleRef, digest: contractsManifestDigest }],
  types: [{ name: whisperXTypes.alignmentEvidence.name, schema: whisperXAlignmentEvidenceSchema }],
  surfaces: [],
  producers: [
    {
      name: whisperXProducers.request.name,
      inputs: [{ name: "basis", type: contractTypes.speechBasis }],
      outputs: [],
      needs: [{ name: "alignment", wants: whisperXTypes.alignmentEvidence }],
      implementation: {
        kind: "registered",
        locator: "@svml/whisperx/request",
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
        locator: "@svml/whisperx/normalize",
        digest: whisperXImplementationDigests.normalize,
      },
    },
  ],
};
