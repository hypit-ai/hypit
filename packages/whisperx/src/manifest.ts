import { speechDependency, speechTypes } from "@hypit/speech";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import { semanticMapDependency, semanticMapTypes } from "@hypit/semantic-map";
import type { CapabilityRef, ModuleManifest, ProducerRef } from "@hypit/protocol";
import { mediaPipelineManifest, mediaPipelineModuleRef } from "@hypit/media-pipeline";
import { speechAlignmentManifest, speechAlignmentModuleRef } from "@hypit/speech-alignment";

export const whisperXModuleRef = { name: "@hypit/whisperx", version: "1" } as const;
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
  format: "hypit.module@1",
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
