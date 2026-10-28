import { audioReconstructionProgramSchema, compositionDependency, compositionTypes } from "@hypit/composition";
import { mediaDependency, mediaTypes, preparedMediaSchema } from "@hypit/media";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { exactTemporalValueSchema, temporalDependency, temporalMapSchema, temporalRelationSpecSchema, temporalTypes } from "@hypit/temporal";
import { frameSpanSchema, timelineDependency, timelineTypes } from "@hypit/timeline";

export const audioTrackModuleRef = { name: "@hypit/audio-track", version: "1" } as const;
export const audioTrackTypes = {
  header: { module: audioTrackModuleRef, name: "AudioTrackHeader" },
  clipSpec: { module: audioTrackModuleRef, name: "AudioClipSpec" },
  set: { module: audioTrackModuleRef, name: "AudioTrackSet" },
  program: { module: audioTrackModuleRef, name: "AudioTrackProgram" },
  reconstruction: { module: audioTrackModuleRef, name: "AudioReconstruction" },
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
  reconstruction: { schema: audioReconstructionProgramSchema, optional: true },
  mix: { schema: object({ gain: { schema: number }, fadeIn: { schema: duration }, fadeOut: { schema: duration } }) },
});
const clip = object({
  id: { schema: string }, subjectId: { schema: string }, window: { schema: frameSpanSchema },
  source: { schema: object({ media: { schema: preparedMediaSchema } }) },
  sampling: { schema: temporalMapSchema },
  reconstruction: { schema: audioReconstructionProgramSchema, optional: true },
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
    audioTrackTypes.reconstruction.name,
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
