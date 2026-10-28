import type { CapabilityRef, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

export const speechEvidenceModuleRef = { name: "@hypit/speech-evidence", version: "1" } as const;

export const speechEvidenceTypes = {
  audio: { module: speechEvidenceModuleRef, name: "SpeechEvidenceAudio" },
  transcript: { module: speechEvidenceModuleRef, name: "SpeechTranscriptEvidence" },
} satisfies Record<string, TypeRef>;

export const speechEvidenceCapabilities = {
  projectAudio: { module: speechEvidenceModuleRef, name: "project-speech-evidence-audio" },
} satisfies Record<string, CapabilityRef>;

export const speechEvidenceProducers = {
  projectAudio: { module: speechEvidenceModuleRef, name: "request-speech-evidence-audio" },
} satisfies Record<string, ProducerRef>;
