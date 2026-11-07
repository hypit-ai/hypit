import { mediaDependency, mediaTypes } from "@hypit/media";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import { timedTranscriptDependency, timedTranscriptTypes } from "@hypit/timed-transcript";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

export const whisperXModuleRef = { name: "@hypit/whisperx", version: "1" } as const;
export const whisperXTypes = {
  language: { module: whisperXModuleRef, name: "WhisperXLanguage" },
} satisfies Record<string, TypeRef>;
export const whisperXCapabilities = {
  transcription: { module: whisperXModuleRef, name: "whisperx-transcription" },
} satisfies Record<string, CapabilityRef>;
export const whisperXProducers = {
  request: { module: whisperXModuleRef, name: "request-whisperx-transcription" },
} satisfies Record<string, ProducerRef>;


export const whisperXManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [speechEvidenceDependency, timedTranscriptDependency, mediaDependency],
  types: [whisperXTypes.language.name],
  capabilities: [{
    name: whisperXCapabilities.transcription.name,
    returns: timedTranscriptTypes.transcript,
  }],
  producers: [
    {
      name: whisperXProducers.request.name,
      inputs: [
        { name: "evidence", type: speechEvidenceTypes.audio },
        { name: "language", type: whisperXTypes.language },
      ],
      result: { kind: "need" as const, name: "transcript", capability: whisperXCapabilities.transcription },
    },
  ],
};
