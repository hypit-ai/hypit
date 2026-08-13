import { speechDependency, speechTypes } from "@narratage/speech";
import { speechEvidenceDependency, speechEvidenceTypes } from "@narratage/speech-evidence";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { digestOf } from "@narratage/protocol";
import type { CapabilityRef, ModuleManifest, ProducerRef } from "@narratage/protocol";
import { mediaPipelineManifest, mediaPipelineModuleRef } from "@narratage/media-pipeline";
import { speechAlignmentManifest, speechAlignmentModuleRef } from "@narratage/speech-alignment";

export const whisperXModuleRef = { name: "@narratage/whisperx", version: "1" } as const;
export const whisperXCapabilities = {
  alignment: { module: whisperXModuleRef, name: "whisperx-alignment" },
} satisfies Record<string, CapabilityRef>;
export const whisperXProducers = {
  request: { module: whisperXModuleRef, name: "request-whisperx-alignment" },
} satisfies Record<string, ProducerRef>;
export const whisperXImplementationDigests = {
  request: digestOf("@narratage/whisperx/request@1"),
  surface: digestOf("@narratage/whisperx/alignment-surface@1"),
};

export const whisperXMarkupSurfaces = [{
    name: "alignment",
    tag: "Alignment",
    mode: "structured",
    outputs: [speechEvidenceTypes.alignedTranscript, semanticMapTypes.complete],
    implementation: {
      digest: whisperXImplementationDigests.surface,
    },
  }] as const;


export const whisperXManifest: ModuleManifest = {
  format: "svml.module@1",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [
    speechDependency,
    speechEvidenceDependency,
    semanticMapDependency,
    { module: mediaPipelineModuleRef, digest: digestOf(mediaPipelineManifest) },
    { module: speechAlignmentModuleRef, digest: digestOf(speechAlignmentManifest) },
  ],
  types: [],
  capabilities: [{
    name: whisperXCapabilities.alignment.name,
    returns: speechEvidenceTypes.alignedTranscript,
  }],
  producers: [
    {
      name: whisperXProducers.request.name,
      inputs: [
        { name: "evidence", type: speechTypes.evidenceAudio },
        { name: "audio", type: speechTypes.audioBasis },
      ],
      outputs: [],
      needs: [{
        name: "alignment",
        capability: whisperXCapabilities.alignment,
        returns: speechEvidenceTypes.alignedTranscript,
      }],
      implementation: {
        digest: whisperXImplementationDigests.request,
      },
    },
  ],
};
