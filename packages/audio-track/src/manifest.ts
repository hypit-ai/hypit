import { compositionDependency, compositionTypes } from "@hypit/composition";
import type { StructuredSurfaceDeclaration, SurfaceVocabulary } from "@hypit/hypit/markup";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { blobRefSchema } from "@hypit/hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import {
  temporalContextAttributeVocabulary,
  temporalWindowAttributeVocabulary,
} from "@hypit/temporal/markup";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

export const audioTrackModuleRef = { name: "@hypit/audio-track", version: "1" } as const;
export const audioTrackTypes = {
  header: { module: audioTrackModuleRef, name: "AudioTrackHeader" },
  sourceTime: { module: audioTrackModuleRef, name: "AudioSourceTime" },
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
const sourceTimePoint = object({ edge: { schema: { kind: "string", enum: ["start", "end"] } }, offset: { schema: duration } });
const sourceTimeBounds = object({ from: { schema: sourceTimePoint }, until: { schema: sourceTimePoint } });
const rational = object({ numerator: { schema: { kind: "number", integer: true, minimum: 1 } }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } });
const sourceTimeRelation: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "rate" } }, target: { schema: sourceTimeBounds },
    targetAt: { schema: sourceTimePoint }, sourceAt: { schema: sourceTimePoint }, rate: { schema: rational },
    source: { schema: sourceTimeBounds }, wrap: { schema: sourceTimeBounds, optional: true } }),
  object({ kind: { schema: { kind: "literal", value: "fit" } }, target: { schema: sourceTimeBounds },
    source: { schema: sourceTimeBounds }, minRate: { schema: number, optional: true }, maxRate: { schema: number, optional: true } }),
] };
const sourceTime = object({ relations: { schema: { kind: "array", minItems: 1, items: sourceTimeRelation } } });
const clipSpec = object({
  id: { schema: string },
  sourceTime: { schema: sourceTime, optional: true },
  mix: { schema: object({ gain: { schema: number }, fadeIn: { schema: duration }, fadeOut: { schema: duration } }) },
});
const frameSpan = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
const clip = object({
  id: { schema: string }, window: { schema: frameSpan },
  source: { schema: object({ artifact: { schema: blobRefSchema(["audio/wav"]) }, sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  sourceTime: { schema: sourceTime },
  mix: { schema: object({ gain: { schema: number }, fadeInSamples: { schema: integer }, fadeOutSamples: { schema: integer } }) },
});

export const audioTrackHeaderSchema: ValueSchema = object({ id: { schema: string } });
export const audioSourceTimeSchema: ValueSchema = sourceTime;
export const audioClipSpecSchema: ValueSchema = clipSpec;
export const audioTrackSetSchema: ValueSchema = object({ clips: { schema: { kind: "array", items: clip } } });
export const audioTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  clips: { schema: { kind: "array", minItems: 1, items: clip } },
});

const clipInputs = [
  { name: "set", type: audioTrackTypes.set }, { name: "header", type: audioTrackTypes.header },
  { name: "timeline", type: timelineTypes.timeline }, { name: "media", type: mediaTypes.synchronized },
  { name: "spec", type: audioTrackTypes.clipSpec }, { name: "window", type: temporalTypes.window },
] as const;

export const audioTrackMarkupSurfaces: readonly (StructuredSurfaceDeclaration & { readonly vocabulary: SurfaceVocabulary })[] = [{
  name: "track", tag: "Track", mode: "structured",
  outputs: [audioTrackTypes.header, audioTrackTypes.sourceTime, audioTrackTypes.clipSpec,
    audioTrackTypes.program, compositionTypes.audioTrack],
  vocabulary: {
    summary: "Places ordinary audio Clips on one completed Timeline and mixes them into one AudioTrack.",
    attributes: [
      { name: "id", kind: "identifier", required: true, summary: "Names this Audio Track and prefixes unnamed Clips." },
      ...temporalContextAttributeVocabulary,
    ],
    children: [{
      tag: "Clip", cardinality: "many",
      summary: "One explicit audio source occurrence with its own Window, partial source-time relation and mix.",
      attributes: [
        { name: "id", kind: "identifier", required: false, summary: "Names this Clip; the Track derives `<track>.clip.<index>` when absent." },
        { name: "source", kind: "reference", required: true, accepts: [mediaTypes.synchronized], summary: "Selects normalized media containing the audio stream." },
        { name: "source-time", kind: "reference", required: false, accepts: [audioTrackTypes.sourceTime], summary: "Applies one reusable partial source-time relation. Inline Map children express the same value." },
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
}, {
  name: "source-time", tag: "SourceTime", mode: "structured",
  outputs: [audioTrackTypes.sourceTime],
  vocabulary: {
    summary: "Authors one reusable partial relation from Clip-local target samples to source-local samples.",
    attributes: [{ name: "id", kind: "identifier", required: true, summary: "Names this AudioSourceTime value." }],
    children: [{ tag: "Map", cardinality: "many", summary: "One affine piece; uncovered target samples are silent.", attributes: [
      { name: "target-from", kind: "literal", required: false, summary: "Starts the target interval; defaults to start." },
      { name: "target-until", kind: "literal", required: false, summary: "Ends the target interval exclusively; defaults to end." },
      { name: "target-at", kind: "literal", required: false, summary: "Names the target anchor paired with source-at." },
      { name: "source-at", kind: "literal", required: false, summary: "Names the source anchor paired with target-at." },
      { name: "rate", kind: "literal", required: false, summary: "Exact positive source samples per target sample; pitch is preserved." },
      { name: "source-from", kind: "literal", required: false, summary: "Starts the permitted or fitted source interval." },
      { name: "source-until", kind: "literal", required: false, summary: "Ends the permitted or fitted source interval exclusively." },
      { name: "wrap-from", kind: "literal", required: false, summary: "Starts an explicitly periodic source interval." },
      { name: "wrap-until", kind: "literal", required: false, summary: "Ends an explicitly periodic source interval exclusively." },
      { name: "min-rate", kind: "literal", required: false, summary: "Optional lower safety bound for a fitted Map." },
      { name: "max-rate", kind: "literal", required: false, summary: "Optional upper safety bound for a fitted Map." },
    ] }],
    example: `<audio:SourceTime id="native-loop">
  <audio:Map rate="1" wrap-from="start" wrap-until="end"/>
</audio:SourceTime>`,
    notes: [
      "Without rate, anchors or wrap, a Map fits the selected source interval across its target interval.",
      "Audio rates are positive and pitch-preserving; silence is represented by an uncovered target interval.",
    ],
  },
}] as const;

export const audioTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audioTrackModuleRef.name,
  version: audioTrackModuleRef.version,
  dependencies: [mediaDependency, timelineDependency, temporalDependency, compositionDependency],
  types: [
    { name: audioTrackTypes.header.name },
    { name: audioTrackTypes.sourceTime.name },
    { name: audioTrackTypes.clipSpec.name },
    { name: audioTrackTypes.set.name },
    { name: audioTrackTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: audioTrackProducers.createSet.name, inputs: [], result: { kind: "output" as const, name: "set", type: audioTrackTypes.set } },
    { name: audioTrackProducers.appendClip.name, inputs: [...clipInputs], result: { kind: "output" as const, name: "set", type: audioTrackTypes.set } },
    { name: audioTrackProducers.finalize.name, inputs: [{ name: "set", type: audioTrackTypes.set }, { name: "header", type: audioTrackTypes.header }], result: { kind: "output" as const, name: "program", type: audioTrackTypes.program } },
    { name: audioTrackProducers.render.name, inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "program", type: audioTrackTypes.program }], result: { kind: "output" as const, name: "track", type: compositionTypes.audioTrack } },
  ],
};

export const audioTrackDependency = { module: audioTrackModuleRef } as const;
