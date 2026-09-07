import { speechDependency, speechTypes } from "@hypit/speech";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { mediaPipelineManifest, mediaPipelineModuleRef } from "@hypit/media-pipeline";
import { speechAlignmentManifest, speechAlignmentModuleRef } from "@hypit/speech-alignment";

export const whisperXModuleRef = { name: "@hypit/whisperx", version: "1" } as const;
export const whisperXTypes = {
  language: { module: whisperXModuleRef, name: "WhisperXLanguage" },
} satisfies Record<string, TypeRef>;
export const whisperXCapabilities = {
  alignment: { module: whisperXModuleRef, name: "whisperx-alignment" },
} satisfies Record<string, CapabilityRef>;
export const whisperXProducers = {
  request: { module: whisperXModuleRef, name: "request-whisperx-alignment" },
} satisfies Record<string, ProducerRef>;

export const whisperXMarkupSurfaces = [{
    name: "semantic-take",
    tag: "SemanticTake",
    mode: "structured",
    outputs: [whisperXTypes.language, speechTypes.semanticTake],
    vocabulary: {
      summary:
        "Publishes a real-media SemanticTake: WhisperX-aligned words for speech, or exact prepared-media boundaries for an empty Segment.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this alignment and prefixes the bindings it publishes." },
        { name: "narrative", kind: "reference", required: true,
          accepts: [narrativeTypes.narrative],
          summary: "Selects the authored Narrative that owns the Segment and Token identities." },
        { name: "segment", kind: "reference", required: true,
          accepts: [narrativeTypes.excerpt],
          summary: "Selects the single authored Segment performed by this Take." },
        { name: "media", kind: "reference", required: true,
          accepts: [mediaTypes.synchronized],
          summary: "Selects the already normalized SynchronizedMedia represented by this Segment." },
        { name: "language", kind: "literal", required: false,
          values: ["en", "zh", "es"],
          summary: "For a Segment with Tokens, explicitly selects the English, Chinese or Spanish WhisperX models." },
      ],
      ports: [
        { name: "take", type: speechTypes.semanticTake,
          summary: "The normalized media plus this Segment's authored words and local frame anchors." },
      ],
      example: `<whisperx:SemanticTake id="opening" narrative={story}
  segment={story.segment.opening} media={opening-media.media} language="en"/>`,
      notes: [
        "A Segment with Tokens states all five attributes and sends its prepared audio for alignment.",
        "An empty Segment omits language and maps its authored start/end Anchors directly to the prepared-media boundaries.",
        "For speech, language is never detected from Script text or audio; each alignment call states en, zh or es explicitly.",
        "Importing this package is what selects the WhisperX model family; the Runtime separately binds the alignment Need to an Endpoint.",
      ],
    },
  }] as const;


export const whisperXManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [
    speechDependency,
    speechEvidenceDependency,
    mediaDependency,
    narrativeDependency,
    { module: mediaPipelineModuleRef },
    { module: speechAlignmentModuleRef },
  ],
  types: [{ name: whisperXTypes.language.name }],
  capabilities: [{
    name: whisperXCapabilities.alignment.name,
    returns: speechEvidenceTypes.alignedTranscript,
  }],
  producers: [
    {
      name: whisperXProducers.request.name,
      inputs: [
        { name: "evidence", type: speechTypes.evidenceAudio },
        { name: "language", type: whisperXTypes.language },
      ],
      outputs: [],
      needs: [{
        name: "alignment",
        capability: whisperXCapabilities.alignment,
        returns: speechEvidenceTypes.alignedTranscript,
      }],
    },
  ],
};
