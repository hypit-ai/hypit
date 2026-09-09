import { semanticTakeSchema, speechDependency, speechTypes } from "@hypit/speech";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import type { ModuleManifest, ValueSchema } from "@hypit/protocol";
export const speechTrackModuleRef = { name: "@hypit/speech-track", version: "1" } as const;
export const speechTrackTypes = {
  header: { module: speechTrackModuleRef, name: "SpeechTrackHeader" },
  trackSet: { module: speechTrackModuleRef, name: "SpeechTrackSet" },
} as const;
export const speechTrackProducers = {
  createSet: { module: speechTrackModuleRef, name: "create-track-set" },
  appendTake: { module: speechTrackModuleRef, name: "append-track-take" },
  assembleTrack: { module: speechTrackModuleRef, name: "assemble-semantic-track" },
} as const;
export const speechTrackHeaderSchema: ValueSchema = { kind: "object", fields: { id: { schema: { kind: "string", minLength: 1 } } } };
export const speechTrackSetSchema: ValueSchema = { kind: "object", fields: { takes: { schema: { kind: "array", items: { kind: "object", fields: { semantic: { schema: semanticTakeSchema } } } } } } };
export const speechTrackMarkupSurfaces = [{
  name: "track", tag: "Track", mode: "structured",
  outputs: [speechTrackTypes.header, semanticTrackTypes.track, compositionTypes.audioTrack],
  vocabulary: {
    summary: "Assembles ordered SemanticTakes into one semantic timeline and its original performance audio.",
    attributes: [{ name: "id", kind: "identifier", required: true, summary: "Names the semantic assembly and its outputs." }],
    children: [{ tag: "Take", cardinality: "many", summary: "A prepared SemanticTake in performance order.",
      attributes: [{ name: "source", kind: "reference", required: true, accepts: [speechTypes.semanticTake], summary: "The normalized, aligned performance." }] }],
    ports: [
      { name: "semantic", type: semanticTrackTypes.track, summary: "The semantic timeline, retaining its prepared material." },
      { name: "audio", type: compositionTypes.audioTrack, summary: "Original performance audio aligned to that timeline; select it explicitly in Film." },
    ],
    example: '<speech:Track id="speech"><speech:Take source={opening.take}/><speech:Take source={answer.take}/></speech:Track>',
    notes: ["Use Media or a project visual component to present the performance. Those components choose placement and motion independently of semantic assembly."],
  },
}] as const;
export const speechTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: speechTrackModuleRef.name,
  version: speechTrackModuleRef.version,
  dependencies: [
    speechDependency,
    compositionDependency,
    semanticTrackDependency,
  ],
  types: [
    { name: speechTrackTypes.header.name },
    { name: speechTrackTypes.trackSet.name },
  ],
  capabilities: [],
  producers: [
    {
      name: speechTrackProducers.createSet.name,
      inputs: [],
      outputs: [{ name: "set", type: speechTrackTypes.trackSet }],
      needs: [],
    },
    {
      name: speechTrackProducers.appendTake.name,
      inputs: [
        { name: "set", type: speechTrackTypes.trackSet },
        { name: "take", type: speechTypes.semanticTake },
      ],
      outputs: [{ name: "set", type: speechTrackTypes.trackSet }],
      needs: [],
    },
    {
      name: speechTrackProducers.assembleTrack.name,
      inputs: [
        { name: "header", type: speechTrackTypes.header },
        { name: "set", type: speechTrackTypes.trackSet },
      ],
      outputs: [{ name: "track", type: semanticTrackTypes.track }],
      needs: [],
    },
  ],
};
