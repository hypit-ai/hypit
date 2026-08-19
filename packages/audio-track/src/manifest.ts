import { compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency, mediaTypes } from "@hypit/media";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { blobRefObjectSchema } from "@hypit/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { semanticMapDependency, semanticMapTypes } from "@hypit/semantic-map";
import { temporalDependency } from "@hypit/temporal";

export const audioTrackModuleRef = { name: "@hypit/audio-track", version: "1" } as const;
export const audioTrackTypes = {
  header: { module: audioTrackModuleRef, name: "AudioTrackHeader" },
  clipSpec: { module: audioTrackModuleRef, name: "AudioClipSpec" },
  set: { module: audioTrackModuleRef, name: "AudioTrackSet" },
  program: { module: audioTrackModuleRef, name: "AudioTrackProgram" },
} satisfies Record<string, TypeRef>;
export const audioTrackProducers = {
  createSet: { module: audioTrackModuleRef, name: "create-audio-track-set" },
  appendProgram: { module: audioTrackModuleRef, name: "append-program-audio-item" },
  appendSelection: { module: audioTrackModuleRef, name: "append-selection-audio-item" },
  appendMoment: { module: audioTrackModuleRef, name: "append-moment-audio-item" },
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
const signedDuration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: signedInteger } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: signedInteger } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: signedInteger }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
const point: ValueSchema = { kind: "oneOf", variants: [
  ...["program.start", "program.end", "selection.start", "selection.end", "moment.cue"].map((ref) => object({
    ref: { schema: { kind: "literal", value: ref } }, offset: { schema: signedDuration, optional: true },
  })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: duration } }),
] };
const projection = object({ start: { schema: point }, end: { schema: point } });
const occupancy: ValueSchema = { kind: "oneOf", variants: [
  object({ mode: { schema: { kind: "literal", value: "once" } }, align: { schema: { kind: "string", enum: ["start", "end"] } } }),
  object({ mode: { schema: { kind: "literal", value: "loop" } }, align: { schema: { kind: "string", enum: ["start", "end"] } } }),
  object({ mode: { schema: { kind: "literal", value: "stretch" } }, minRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } }, maxRate: { schema: { kind: "number", minimum: 0.000001, maximum: 100 } }, pitch: { schema: { kind: "literal", value: "preserve" } } }),
] };
const clipSpec = object({

  id: { schema: string },
  projection: { schema: projection },
  expansion: { schema: object({ kind: { schema: { kind: "string", enum: ["one", "each"] } } }) },
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
  { name: "spec", type: audioTrackTypes.clipSpec },
] as const;

export const audioTrackMarkupSurfaces = [{
    name: "track", tag: "Track", mode: "structured",
    outputs: [audioTrackTypes.header, audioTrackTypes.clipSpec, audioTrackTypes.program, compositionTypes.audioTrack],
  }] as const;


export const audioTrackManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audioTrackModuleRef.name,
  version: audioTrackModuleRef.version,
  dependencies: [mediaDependency, narrativeDependency, semanticMapDependency, programSpaceDependency, temporalDependency, compositionDependency],
  types: [
    { name: audioTrackTypes.header.name },
    { name: audioTrackTypes.clipSpec.name },
    { name: audioTrackTypes.set.name },
    { name: audioTrackTypes.program.name },
  ],
  capabilities: [],
  producers: [
    { name: audioTrackProducers.createSet.name, inputs: [], outputs: [{ name: "set", type: audioTrackTypes.set }], needs: [] },
    { name: audioTrackProducers.appendProgram.name, inputs: [...baseInputs], outputs: [{ name: "set", type: audioTrackTypes.set }], needs: [] },
    { name: audioTrackProducers.appendSelection.name, inputs: [...baseInputs, { name: "map", type: semanticMapTypes.complete }, { name: "selection", type: narrativeTypes.selection }], outputs: [{ name: "set", type: audioTrackTypes.set }], needs: [] },
    { name: audioTrackProducers.appendMoment.name, inputs: [...baseInputs, { name: "map", type: semanticMapTypes.complete }, { name: "moment", type: narrativeTypes.moment }], outputs: [{ name: "set", type: audioTrackTypes.set }], needs: [] },
    { name: audioTrackProducers.finalize.name, inputs: [{ name: "set", type: audioTrackTypes.set }, { name: "header", type: audioTrackTypes.header }], outputs: [{ name: "program", type: audioTrackTypes.program }], needs: [] },
    { name: audioTrackProducers.render.name, inputs: [{ name: "space", type: programSpaceTypes.programSpace }, { name: "program", type: audioTrackTypes.program }], outputs: [{ name: "track", type: compositionTypes.audioTrack }], needs: [] },
  ],
};
export const audioTrackDependency = { module: audioTrackModuleRef } as const;
