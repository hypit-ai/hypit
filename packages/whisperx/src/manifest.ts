import { speechDependency, speechTypes } from "@hypit/speech";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
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
    name: "semantic-take",
    tag: "SemanticTake",
    mode: "structured",
    outputs: [speechTypes.semanticTake],
    vocabulary: {
      summary:
        "Measures one normalized Take with WhisperX and aligns one authored Segment into a self-contained SemanticTake.",
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
          summary: "Selects the already normalized SynchronizedMedia measured by WhisperX." },
      ],
      ports: [
        { name: "take", type: speechTypes.semanticTake,
          summary: "The normalized media plus this Segment's authored words and local frame anchors." },
      ],
      example: `<whisperx:SemanticTake id="opening" narrative={story}
  segment={story.segment.opening} media={opening-media.media}/>`,
      notes: [
        "All three attributes are required; the element accepts no children and no text content.",
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
