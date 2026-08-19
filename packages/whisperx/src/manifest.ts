import { narrativeTypes } from "@hypit/narrative";
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
    vocabulary: {
      summary:
        "Runs one WhisperX acoustic pass over the speech audio and locates the authored Narrative in it, publishing the aligned transcript and the SemanticMap that carries word timing.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this alignment and prefixes the bindings it publishes." },
        { name: "narrative", kind: "reference", required: true,
          accepts: [narrativeTypes.narrative],
          summary: "Selects the authored Narrative whose Segments the measured speech is assigned to." },
        { name: "audio", kind: "reference", required: true,
          accepts: [speechTypes.audioBasis],
          summary: "Selects the speech audio basis this element measures and aligns against." },
      ],
      ports: [
        { name: "evidence", type: speechEvidenceTypes.alignedTranscript,
          summary: "The provider-neutral aligned transcript WhisperX returned, addressed as `<id>.evidence`." },
        { name: "map", type: semanticMapTypes.complete,
          summary: "The complete SemanticMap placing every authored word in the frame domain, addressed as `<id>.map`." },
      ],
      example: `<whisperx:Alignment id="timing" narrative={story} audio={speech.audio}/>`,
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
