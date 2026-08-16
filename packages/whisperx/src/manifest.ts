import { speechDependency, speechTypes } from "@narratage/speech";
import { speechEvidenceDependency, speechEvidenceTypes } from "@narratage/speech-evidence";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
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

export const whisperXMarkupSurfaces = [{
    name: "alignment",
    tag: "Alignment",
    mode: "structured",
    outputs: [speechEvidenceTypes.alignedTranscript, semanticMapTypes.complete],
  }] as const;


export const whisperXManifest: ModuleManifest = {
  format: "narratage.module@1",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [
    speechDependency,
    speechEvidenceDependency,
    semanticMapDependency,
    { module: mediaPipelineModuleRef },
    { module: speechAlignmentModuleRef },
  ],
  types: [],
  capabilities: [{
    name: whisperXCapabilities.alignment.name,
    returns: speechEvidenceTypes.alignedTranscript,
  }],
  producers: [
    {
      name: whisperXProducers.request.name,
      inputs: [{ name: "evidence", type: speechTypes.evidenceAudio }],
      outputs: [],
      needs: [{
        name: "alignment",
        capability: whisperXCapabilities.alignment,
        returns: speechEvidenceTypes.alignedTranscript,
      }],
    },
  ],
};
