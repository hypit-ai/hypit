import type { CapabilityRef, TypeRef } from "@hypit/hypit/module";
import type { ProducerRef } from "@hypit/hypit/module";

export const speechEvidenceModuleRef = { name: "@hypit/speech-evidence" } as const;

export const speechEvidenceTypes = {
  audio: { module: speechEvidenceModuleRef, name: "SpeechEvidenceAudio" },
} satisfies Record<string, TypeRef>;

export const speechEvidenceCapabilities = {
  projectAudio: { module: speechEvidenceModuleRef, name: "project-speech-evidence-audio" },
} satisfies Record<string, CapabilityRef>;

export const speechEvidenceProducers = {
  projectAudio: { module: speechEvidenceModuleRef, name: "request-speech-evidence-audio" },
} satisfies Record<string, ProducerRef>;
