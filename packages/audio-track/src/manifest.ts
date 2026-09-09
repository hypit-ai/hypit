import { temporalContextAttributeVocabulary } from "@hypit/temporal-markup";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { blobRefObjectSchema } from "@hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticTrackDependency } from "@hypit/semantic-track";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import { temporalWindowAttributeVocabulary } from "@hypit/temporal-markup";

export const audioTrackModuleRef = { name: "@hypit/audio-track", version: "1" } as const;
export const audioTrackTypes = {
  header: { module: audioTrackModuleRef, name: "AudioTrackHeader" },
  clipSpec: { module: audioTrackModuleRef, name: "AudioClipSpec" },
  set: { module: audioTrackModuleRef, name: "AudioTrackSet" },
  program: { module: audioTrackModuleRef, name: "AudioTrackProgram" },
} satisfies Record<string, TypeRef>;
export const audioTrackProducers = {
  createSet: { module: audioTrackModuleRef, name: "create-audio-track-set" },
  appendItem: { module: audioTrackModuleRef, name: "append-audio-item" },
  finalize: { module: audioTrackModuleRef, name: "finalize-audio-track" },
  render: { module: audioTrackModuleRef, name: "render-audio-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const signedInteger = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
const occupancy: ValueSchema = { kind: "oneOf", variants: [
  object({ mode: { schema: { kind: "literal", value: "once" } }, align: { schema: { kind: "string", enum: ["start", "end"] } } }),
  object({ mode: { schema: { kind: "literal", value: "loop" } }, align: { schema: { kind: "string", enum: ["start", "end"] } } }),
  object({ mode: { schema: { kind: "literal", value: "stretch" } }, minRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } }, maxRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } }, pitch: { schema: { kind: "literal", value: "preserve" } } }),
] };
const clipSpec = object({

  id: { schema: string },
  trim: { schema: object({ start: { schema: duration, optional: true }, end: { schema: duration, optional: true } }) },
  occupancy: { schema: occupancy },
  mix: { schema: object({ gain: { schema: number }, fadeIn: { schema: duration }, fadeOut: { schema: duration } }) },
});
const frameSpan = object({ startFrame: { schema: integer }, endFrameExclusive: { schema: integer } });
const resolvedOccupancy = occupancy;
const item = object({
  id: { schema: string }, window: { schema: frameSpan },
  source: { schema: object({ artifact: { schema: blobRefObjectSchema(["audio/wav"]) }, sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  trim: { schema: object({ startSample: { schema: integer }, endSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } } }) },
  occupancy: { schema: resolvedOccupancy },
  mix: { schema: object({ gain: { schema: number }, fadeInSamples: { schema: integer }, fadeOutSamples: { schema: integer } }) },
});
export const audioTrackHeaderSchema: ValueSchema = object({
  id: { schema: string },
});
export const audioClipSpecSchema: ValueSchema = clipSpec;
export const audioTrackSetSchema: ValueSchema = object({
  items: { schema: { kind: "array", items: item } },
});
export const audioTrackProgramSchema: ValueSchema = object({
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: item } },
});

const baseInputs = [
  { name: "set", type: audioTrackTypes.set }, { name: "header", type: audioTrackTypes.header },
  { name: "space", type: programSpaceTypes.programSpace }, { name: "media", type: mediaTypes.synchronized },
  { name: "spec", type: audioTrackTypes.clipSpec }, { name: "window", type: temporalTypes.window },
] as const;

export const audioTrackMarkupSurfaces = [{
    name: "track", tag: "Track", mode: "structured",
    outputs: [audioTrackTypes.header, audioTrackTypes.clipSpec, temporalTypes.instantSpec, temporalTypes.windowSpec, temporalTypes.instant, temporalTypes.window, audioTrackTypes.program, compositionTypes.audioTrack],
    vocabulary: {
      summary: "One Audio Track: explicitly prepared audio Clips placed on the selected film time axis and lowered to one ordinary peer AudioTrack.",
      attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names this Audio Track and prefixes the identity of every Clip that does not name itself." },
        ...temporalContextAttributeVocabulary,
      ],
      children: [
        { tag: "Clip", cardinality: "many",
          summary: "Places one SynchronizedMedia source on an exact program window with its own trim, occupancy and mix.",
          attributes: [
            { name: "id", kind: "identifier", required: false,
              summary: "Names this Clip; the Track derives `<track>.clip.<index>` when it is absent." },
            { name: "source", kind: "reference", required: true,
              accepts: [mediaTypes.synchronized],
              summary: "Selects the explicitly prepared audio this Clip plays." },
            ...temporalWindowAttributeVocabulary,
            { name: "trim-start", kind: "literal", required: false,
              summary: "Sets the source start position; defaults to the source beginning." },
            { name: "trim-end", kind: "literal", required: false,
              summary: "Sets the exclusive source end position; defaults to the source end, not a duration subtracted from its tail." },
            { name: "playback", kind: "literal", required: false,
              values: ["once", "once-start", "once-end", "loop", "loop-start", "loop-end", "stretch"],
              summary: "Decides how the source occupies a window longer or shorter than itself; defaults to `once`." },
            { name: "min-rate", kind: "literal", required: false,
              summary: "Bounds the slowest rate bounded stretch may use." },
            { name: "max-rate", kind: "literal", required: false,
              summary: "Bounds the fastest rate bounded stretch may use." },
            { name: "gain", kind: "literal", required: false,
              summary: "Scales this Clip by a linear gain; defaults to `1`." },
            { name: "fade-in", kind: "literal", required: false,
              summary: "Fixes the exact fade-in length; defaults to `0f`." },
            { name: "fade-out", kind: "literal", required: false,
              summary: "Fixes the exact fade-out length; defaults to `0f`." },
          ] },
      ],
      ports: [
        { name: "program", type: audioTrackTypes.program, summary: "The resolved sample-exact item list this Track renders from." },
        { name: "track", type: compositionTypes.audioTrack, summary: "The rendered AudioTrack that Film composes with its peers." },
      ],
      example: `<audio:Track id="music-bed" semantic={speech.semantic}>
  <audio:Clip source={music-media.media} during="program"
    playback="loop-end" gain="0.28" fade-in="600ms" fade-out="800ms"/>
</audio:Track>`,
      notes: [
        "A Track requires at least one Clip, and neither a Track nor a Clip accepts text content.",
        "A Clip states exactly one window form: `during`, `at` with `for`, `until` with `for`, or `start` with `end`.",
        "A point expression is `program.start`, `program.end`, `selection.start`, `selection.end`, `segment.start`, `segment.end` or `moment.cue`, each optionally offset by `+` or `-` and a duration, or a bare duration read as an absolute position.",
        "Bind selection, segment and/or moment only when the start/end expressions use them; different endpoints can use different bindings.",
        "`min-rate` and `max-rate` are rejected unless `playback` is `stretch`.",
      ],
    },
  }] as const;


export const audioTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audioTrackModuleRef.name,
  version: audioTrackModuleRef.version,
  dependencies: [mediaDependency, narrativeDependency, programSpaceDependency, semanticTrackDependency, temporalDependency, compositionDependency],
  types: [
    { name: audioTrackTypes.header.name },
    { name: audioTrackTypes.clipSpec.name },
    { name: audioTrackTypes.set.name },
    { name: audioTrackTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: audioTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: audioTrackTypes.set }], needs: [] },
    { name: audioTrackProducers.appendItem.name, inputs: [...baseInputs], outputs: [{ name: "set", type: audioTrackTypes.set }], needs: [] },
    { name: audioTrackProducers.finalize.name, inputs: [{ name: "set", type: audioTrackTypes.set }, { name: "header", type: audioTrackTypes.header }], outputs: [{ name: "program", type: audioTrackTypes.program }], needs: [] },
    { name: audioTrackProducers.render.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: audioTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [] },
  ],
};
export const audioTrackDependency = { module: audioTrackModuleRef } as const;
