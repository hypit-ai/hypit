import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalDependency, narrativeTemporalTypes } from "@hypit/narrative-temporal";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { speechAlignmentModuleRef } from "@hypit/narrative-speech-alignment";
import { temporalDependency, temporalTypes } from "@hypit/temporal";

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
    name: "alignment",
    tag: "Alignment",
    mode: "structured",
    outputs: [whisperXTypes.language, narrativeTemporalTypes.narrativeAlignment],
    vocabulary: {
      summary:
        "Publishes source-local NarrativeAlignment: WhisperX-aligned words for speech, or exact prepared-media boundaries for an empty Segment.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the alignment it publishes." },
        { name: "narrative", kind: "reference", required: true,
          accepts: [narrativeTypes.narrative],
          summary: "Selects the authored Narrative that owns the Segment and Token identities." },
        { name: "segment", kind: "reference", required: true,
          accepts: [narrativeTypes.segmentRef],
          summary: "Selects the single authored Segment performed by this media." },
        { name: "media", kind: "reference", required: true,
          accepts: [mediaTypes.synchronized],
          summary: "Selects the already normalized SynchronizedMedia represented by this Segment." },
        { name: "domain", kind: "reference", required: true,
          accepts: [temporalTypes.localDomain],
          summary: "Selects that normalized media's single local temporal domain." },
        { name: "language", kind: "literal", required: false,
          summary: "For a Segment with Tokens, explicitly states its spoken language code. The selected service owns the available alignment models." },
      ],
      ports: [
        { name: "alignment", type: narrativeTemporalTypes.narrativeAlignment,
          summary: "This Segment's authored boundary identities on the local domain, without media." },
      ],
      example: `<whisperx:Alignment id="opening" narrative={story}
  segment={story.segment.opening} media={opening-media.media}
  domain={opening-media.domain} language="en"/>`,
      notes: [
        "A Segment with Tokens states all five attributes and sends its prepared audio for alignment.",
        "An empty Segment omits media and language and maps its authored start/end Anchors directly to the selected domain boundaries.",
        "For speech, each alignment call states an explicit lowercase two- or three-letter language code; language is not inferred from Script text or audio.",
        "Importing this package is what selects the WhisperX model family; the Runtime separately binds the alignment Need to an Endpoint.",
      ],
    },
  }] as const;


export const whisperXManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: whisperXModuleRef.name,
  version: whisperXModuleRef.version,
  dependencies: [
    speechEvidenceDependency,
    mediaDependency,
    narrativeDependency,
    narrativeTemporalDependency,
    { module: speechAlignmentModuleRef },
    temporalDependency,
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
        { name: "evidence", type: speechEvidenceTypes.audio },
        { name: "language", type: whisperXTypes.language },
      ],
      result: { kind: "need" as const, name: "alignment", capability: whisperXCapabilities.alignment },
    },
  ],
};
