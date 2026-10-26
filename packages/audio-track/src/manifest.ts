import { compositionDependency, compositionTypes } from "@hypit/composition";
import type { StructuredSurfaceDeclaration, SurfaceVocabulary } from "@hypit/hypit/markup";
import { mediaDependency, mediaTypes, preparedMediaSchema } from "@hypit/media";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { exactTemporalValueSchema, temporalDependency, temporalMapSchema, temporalRelationSpecSchema, temporalTypes } from "@hypit/temporal";
import {
  temporalContextAttributeVocabulary,
  temporalWindowAttributeVocabulary,
} from "@hypit/temporal/markup";
import { frameSpanSchema, timelineDependency, timelineTypes } from "@hypit/timeline";

export const audioTrackModuleRef = { name: "@hypit/audio-track", version: "1" } as const;
export const audioTrackTypes = {
  header: { module: audioTrackModuleRef, name: "AudioTrackHeader" },
  clipSpec: { module: audioTrackModuleRef, name: "AudioClipSpec" },
  set: { module: audioTrackModuleRef, name: "AudioTrackSet" },
  program: { module: audioTrackModuleRef, name: "AudioTrackProgram" },
} satisfies Record<string, TypeRef>;

export const audioTrackProducers = {
  createSet: { module: audioTrackModuleRef, name: "create-audio-track-set" },
  appendClip: { module: audioTrackModuleRef, name: "append-audio-clip" },
  finalize: { module: audioTrackModuleRef, name: "finalize-audio-track" },
  render: { module: audioTrackModuleRef, name: "render-audio-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
const clipSpec = object({
  id: { schema: string },
  sampling: { schema: temporalRelationSpecSchema, optional: true },
  mix: { schema: object({ gain: { schema: number }, fadeIn: { schema: duration }, fadeOut: { schema: duration } }) },
});
const clip = object({
  id: { schema: string }, subjectId: { schema: string }, window: { schema: frameSpanSchema },
  source: { schema: object({ media: { schema: preparedMediaSchema } }) },
  sampling: { schema: temporalMapSchema },
  mix: { schema: object({ gain: { schema: number }, fadeIn: { schema: exactTemporalValueSchema },
    fadeOut: { schema: exactTemporalValueSchema } }) },
});

export const audioTrackHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const audioClipSpecSchema: ValueSchema = clipSpec;
export const audioTrackSetSchema: ValueSchema = object({ clips: { schema: { kind: "array", items: clip } } });
export const audioTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  clips: { schema: { kind: "array", minItems: 1, items: clip } },
});

const clipInputs = [
  { name: "set", type: audioTrackTypes.set }, { name: "header", type: audioTrackTypes.header },
  { name: "timeline", type: timelineTypes.timeline }, { name: "media", type: mediaTypes.prepared },
  { name: "spec", type: audioTrackTypes.clipSpec }, { name: "window", type: temporalTypes.window },
] as const;

export const audioTrackMarkupSurfaces: readonly (StructuredSurfaceDeclaration & { readonly vocabulary: SurfaceVocabulary })[] = [{
  name: "track", tag: "Track", mode: "structured",
  outputs: [audioTrackTypes.header, audioTrackTypes.clipSpec,
    audioTrackTypes.program, compositionTypes.audioTrack],
  vocabulary: {
    summary: "Places ordinary audio Clips on one completed Timeline and mixes them into one AudioTrack.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names this Audio Track and prefixes unnamed Clips." },
      ...temporalContextAttributeVocabulary,
    ],
    children: [{
      tag: "Clip", cardinality: "many",
      summary: "One explicit audio source occurrence with its own Window, partial temporal sampling relation and mix.",
      attributes: [
        { name: "id", kind: "identifier", required: false, summary: "Names this Clip; the Track derives `<track>.clip.<index>` when absent." },
        { name: "source", kind: "reference", required: true, accepts: [mediaTypes.prepared], summary: "Selects prepared media containing the audio stream; terminal audio execution evaluates its exact source Map." },
        ...temporalWindowAttributeVocabulary,
        { name: "gain", kind: "literal", required: false, summary: "Linear gain; defaults to `1`." },
        { name: "fade-in", kind: "literal", required: false, summary: "Exact fade-in length; defaults to `0f`." },
        { name: "fade-out", kind: "literal", required: false, summary: "Exact fade-out length; defaults to `0f`." },
      ],
    }],
    ports: [
      { name: "program", type: audioTrackTypes.program, summary: "Resolved authored Clips for Studio and declared consumers." },
      { name: "audio", type: compositionTypes.audioTrack, summary: "The AudioTrack Film composes with peer contributions." },
    ],
    example: `<audio:Track id="mix" timeline={program.timeline}>
  <audio:Clip source={voice-media.media} during={program.voice}/>
  <audio:Clip source={music-media.media} during={program.window} gain="0.18">
    <audio:Map rate="1" wrap-from="start" wrap-until="end"/>
  </audio:Clip>
</audio:Track>`,
    notes: [
      "A Track requires at least one Clip and accepts no text content.",
      "A Clip references one already resolved Window through `during`.",
      "Project semantic, beat or other domain time upstream, then pass the resolved Window here.",
      "Omitting Map means bounded partial identity; uncovered target samples are silent.",
    ],
  },
}] as const;

export const audioTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audioTrackModuleRef.name,
  version: audioTrackModuleRef.version,
  dependencies: [mediaDependency, timelineDependency, temporalDependency, compositionDependency],
  types: [
    audioTrackTypes.header.name,
    audioTrackTypes.clipSpec.name,
    audioTrackTypes.set.name,
    audioTrackTypes.program.name,
  ],
  capabilities: [],
  producers: [
    { name: audioTrackProducers.createSet.name, inputs: [], result: { kind: "output" as const, name: "set", type: audioTrackTypes.set } },
    { name: audioTrackProducers.appendClip.name, inputs: [...clipInputs], result: { kind: "output" as const, name: "set", type: audioTrackTypes.set } },
    { name: audioTrackProducers.finalize.name, inputs: [{ name: "set", type: audioTrackTypes.set }, { name: "header", type: audioTrackTypes.header }], result: { kind: "output" as const, name: "program", type: audioTrackTypes.program } },
    { name: audioTrackProducers.render.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "program", type: audioTrackTypes.program }], result: { kind: "output" as const, name: "track", type: compositionTypes.audioTrack } },
  ],
};

export const audioTrackDependency = audioTrackModuleRef;
