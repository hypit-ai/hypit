import { compositionDependency, compositionTypes } from "@hypit/composition";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalContextAttributeVocabulary } from "@hypit/temporal/markup";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const audioMixModuleRef = { name: "@hypit/audio-mix", version: "1" } as const;
export const audioMixTypes = {
  header: { module: audioMixModuleRef, name: "AudioMixHeader" },
  inputSpec: { module: audioMixModuleRef, name: "AudioMixInputSpec" },
  set: { module: audioMixModuleRef, name: "AudioMixSet" },
} satisfies Record<string, TypeRef>;
export const audioMixProducers = {
  createSet: { module: audioMixModuleRef, name: "create-mix-set" },
  appendInput: { module: audioMixModuleRef, name: "append-mix-input" },
  finalize: { module: audioMixModuleRef, name: "finalize-mix" },
} satisfies Record<string, ProducerRef>;
const string = { kind: "string", minLength: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({ kind: "object", fields });
export const audioMixHeaderSchema = object({ id: { schema: string } });
export const audioMixInputSpecSchema = object({ id: { schema: string }, gain: { schema: { kind: "number", minimum: 0 } } });
export const audioMixSetSchema = object({ inputs: { schema: { kind: "array", items: { kind: "object", fields: {}, allowUnknown: true } } } });

export const audioMixMarkupSurfaces = [{
  name: "track", tag: "Track", mode: "structured",
  outputs: [audioMixTypes.header, audioMixTypes.inputSpec, compositionTypes.audioTrack],
  vocabulary: {
    summary: "Closes peer AudioTrack signal graphs into one explicit additive mix with optional per-input gain.",
    appearance: "The output is the exact sum of every selected input after its declared scalar gain; no normalization or limiter is hidden.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names the resulting closed AudioTrack." },
      ...temporalContextAttributeVocabulary,
    ],
    children: [{ tag: "Input", cardinality: "many", summary: "Adds one closed AudioTrack output to this mix.", attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names this routing edge." },
      { name: "source", kind: "reference", required: true, accepts: [compositionTypes.audioTrack], summary: "Selects the closed input signal." },
      { name: "gain", kind: "literal", required: false, summary: "Applies a non-negative scalar before summing; defaults to 1." },
    ] }],
    ports: [{ name: "audio", type: compositionTypes.audioTrack, summary: "The closed single-output signal graph." }],
    example: [
      '<mix:Track id="dialogue" timeline={story.timeline}>',
      '  <mix:Input id="host" source={host.audio}/>',
      '  <mix:Input id="guest" source={guest.audio} gain="0.9"/>',
      "</mix:Track>",
    ].join("\n"),
  },
}] as const;

export const audioMixManifest: ModuleManifest = {
  format: "hypit.module@1", name: audioMixModuleRef.name, version: audioMixModuleRef.version,
  dependencies: [compositionDependency, timelineDependency],
  types: [audioMixTypes.header.name, audioMixTypes.inputSpec.name, audioMixTypes.set.name], capabilities: [],
  producers: [
    { name: audioMixProducers.createSet.name, inputs: [], result: { kind: "output", name: "set", type: audioMixTypes.set } },
    { name: audioMixProducers.appendInput.name, inputs: [
      { name: "set", type: audioMixTypes.set }, { name: "timeline", type: timelineTypes.timeline },
      { name: "spec", type: audioMixTypes.inputSpec }, { name: "track", type: compositionTypes.audioTrack },
    ], result: { kind: "output", name: "set", type: audioMixTypes.set } },
    { name: audioMixProducers.finalize.name, inputs: [
      { name: "set", type: audioMixTypes.set }, { name: "header", type: audioMixTypes.header },
      { name: "timeline", type: timelineTypes.timeline },
    ], result: { kind: "output", name: "track", type: compositionTypes.audioTrack } },
  ],
};
