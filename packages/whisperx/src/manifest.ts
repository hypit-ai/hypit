import { mediaDependency, mediaTypes } from "@hypit/media";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
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

export const whisperXMarkupSurfaces = [{
    name: "transcription",
    tag: "Transcription",
    mode: "structured",
    outputs: [whisperXTypes.language, speechEvidenceTypes.transcript],
    vocabulary: {
      summary: "Transcribes normalized media into provider-neutral speech evidence in a fixed 16 kHz sample domain.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this transcription operation and its transcript output." },
        { name: "media", kind: "reference", required: true,
          accepts: [mediaTypes.synchronized],
          summary: "Selects the normalized media whose audio is transcribed." },
        { name: "language", kind: "literal", required: true,
          summary: "Explicitly states the spoken language code. The selected service owns the available transcription models." },
      ],
      ports: [
        { name: "transcript", type: speechEvidenceTypes.transcript,
          summary: "Provider-neutral word, character and speech-activity evidence in exact 16 kHz sample coordinates." },
      ],
      example: `<whisperx:Transcription id="opening-transcription"
  media={opening-media.media} language="en"/>`,
      notes: [
        "This Surface does not read Narrative or LocalTemporalDomain and does not publish NarrativeAlignment.",
        "Language is not inferred from Script text or audio.",
        "Importing this package selects the WhisperX model family; the Runtime separately binds the transcription Need to an Endpoint.",
      ],
    },
  }] as const;


export const whisperXManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [speechEvidenceDependency, mediaDependency],
  types: [whisperXTypes.language.name],
  capabilities: [{
    name: whisperXCapabilities.transcription.name,
    returns: speechEvidenceTypes.transcript,
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
