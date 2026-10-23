import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { narrativeTemporalDependency, narrativeTemporalTypes } from "@hypit/narrative-temporal";
import { speechEvidenceDependency, speechEvidenceTypes } from "@hypit/speech-evidence";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import type { ModuleManifest, ProducerRef } from "@hypit/hypit/protocol";

export const speechAlignmentModuleRef = { name: "@hypit/narrative-speech-alignment", version: "1" } as const;
export const speechAlignmentProducers = {
  alignNarrative: { module: speechAlignmentModuleRef, name: "align-narrative" },
} satisfies Record<string, ProducerRef>;
export const speechAlignmentMarkupSurfaces = [{
  name: "alignment",
  tag: "Alignment",
  mode: "structured",
  outputs: [narrativeTemporalTypes.narrativeAlignment],
  vocabulary: {
    summary: "Relates one authored Narrative Segment to a local temporal domain using explicit speech evidence, or exact domain boundaries for an empty Segment.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the NarrativeAlignment output." },
      { name: "narrative", kind: "reference", required: true, accepts: [narrativeTypes.narrative],
        summary: "Selects the Narrative that owns the Segment and Token identities." },
      { name: "segment", kind: "reference", required: true, accepts: [narrativeTypes.segmentRef],
        summary: "Selects the single authored Segment represented by this local domain." },
      { name: "domain", kind: "reference", required: true, accepts: [temporalTypes.localDomain],
        summary: "Selects the local temporal domain onto which authored meaning is aligned." },
      { name: "evidence", kind: "reference", required: false, accepts: [speechEvidenceTypes.transcript],
        summary: "Selects provider-neutral speech evidence. Required for a Segment containing Tokens and omitted for an empty Segment." },
    ],
    ports: [{ name: "alignment", type: narrativeTemporalTypes.narrativeAlignment,
      summary: "Authored Segment and Token identities located on the selected local domain." }],
    example: `<speechalign:Alignment id="opening-alignment" narrative={story}
  segment={story.segment.opening} domain={opening-media.domain}
  evidence={opening-transcription.transcript}/>` ,
    notes: [
      "The evidence source is irrelevant once it has the SpeechTranscriptEvidence Type.",
      "An empty Segment omits evidence and maps its authored boundaries directly to the complete domain.",
    ],
  },
}] as const;

export const speechAlignmentManifest: ModuleManifest = {
  format: "hypit.module@1", name: speechAlignmentModuleRef.name, version: speechAlignmentModuleRef.version,
  dependencies: [narrativeDependency, narrativeTemporalDependency, speechEvidenceDependency, temporalDependency],
  types: [], capabilities: [], producers: [{
    name: speechAlignmentProducers.alignNarrative.name,
    inputs: [{ name: "narrative", type: narrativeTypes.narrative }, { name: "segment", type: narrativeTypes.segmentRef },
      { name: "domain", type: temporalTypes.localDomain },
      { name: "evidence", type: speechEvidenceTypes.transcript }],
    result: { kind: "output" as const, name: "alignment", type: narrativeTemporalTypes.narrativeAlignment },
  }],
};
export const speechAlignmentDependency = speechAlignmentModuleRef;
