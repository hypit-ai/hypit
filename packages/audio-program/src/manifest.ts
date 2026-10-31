import { audioReconstructionProgramSchema, compositionDependency, compositionTypes, audioGainEnvelopeSchema, audioSampleSpanSchema } from "@hypit/composition";
import { mediaDependency, mediaTypes, preparedAudioSourceSchema } from "@hypit/media";
import { exactTemporalValueSchema, temporalDependency, temporalMapSchema } from "@hypit/temporal";
import { timelineDependency, timelineTypes } from "@hypit/timeline";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const audioProgramModuleRef = { name: "@hypit/audio-program", version: "1" } as const;
export const audioProgramTypes = {
  program: { module: audioProgramModuleRef, name: "AudioProgram" },
} satisfies Record<string, TypeRef>;
export const audioProgramCapabilities = {
  render: { module: audioProgramModuleRef, name: "render-timeline-audio" },
} satisfies Record<string, CapabilityRef>;
export const audioProgramProducers = {
  compile: { module: audioProgramModuleRef, name: "compile-audio-program" },
  render: { module: audioProgramModuleRef, name: "request-audio-render" },
  renderRange: { module: audioProgramModuleRef, name: "request-audio-range" },
} satisfies Record<string, ProducerRef>;

const integer = { kind: "number", integer: true, minimum: 0 } as const;
const signalRef: ValueSchema = { kind: "object", fields: {
  node: { schema: { kind: "string", minLength: 1 } },
  port: { schema: { kind: "literal", value: "signal" } },
} };
const programClip: ValueSchema = {
  kind: "object",
  fields: {
    id: { schema: { kind: "string", minLength: 1 } },
    source: { schema: preparedAudioSourceSchema },
    preparation: { schema: temporalMapSchema },
    sampling: { schema: temporalMapSchema },
    reconstruction: { schema: audioReconstructionProgramSchema, optional: true },
    target: { schema: { kind: "object", fields: {
      start: { schema: exactTemporalValueSchema },
      end: { schema: exactTemporalValueSchema },
    } } },
    targetStartSample: { schema: integer },
    targetEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
    mixStartSample: { schema: { kind: "number", integer: true } },
    mixEndSampleExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
    gain: { schema: { kind: "number", minimum: 0 } },
    fadeInSamples: { schema: integer },
    fadeOutSamples: { schema: integer },
    gainEnvelope: { schema: audioGainEnvelopeSchema, optional: true },
    audibility: { schema: { kind: "array", items: audioSampleSpanSchema }, optional: true },
  },
};
const programNode: ValueSchema = { kind: "oneOf", variants: [
  { kind: "object", fields: {
    kind: { schema: { kind: "literal", value: "silence" } },
    id: { schema: { kind: "string", minLength: 1 } },
  } },
  { kind: "object", fields: {
    kind: { schema: { kind: "literal", value: "source" } },
    id: { schema: { kind: "string", minLength: 1 } },
    clip: { schema: programClip },
  } },
  { kind: "object", fields: {
    kind: { schema: { kind: "literal", value: "mix" } },
    id: { schema: { kind: "string", minLength: 1 } },
    inputs: { schema: { kind: "array", minItems: 1, items: signalRef } },
  } },
  { kind: "object", fields: {
    kind: { schema: { kind: "literal", value: "process" } },
    id: { schema: { kind: "string", minLength: 1 } },
    inputs: { schema: { kind: "object", allowUnknown: true, fields: {} } },
    program: { schema: audioReconstructionProgramSchema },
  } },
] };
export const audioProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    frameRate: { schema: { kind: "object", fields: {
      numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
      denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
    } } },
    frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
    sampleRate: { schema: { kind: "literal", value: 48_000 } },
    sampleFrames: { schema: { kind: "number", integer: true, minimum: 1 } },
    graph: { schema: { kind: "object", fields: {
      nodes: { schema: { kind: "array", minItems: 1, items: programNode } },
      output: { schema: signalRef },
    } } },
  },
};

export const audioProgramManifest: ModuleManifest = {
  format: "hypit.module@1",
  ...audioProgramModuleRef,
  dependencies: [compositionDependency, mediaDependency, temporalDependency, timelineDependency],
  types: [audioProgramTypes.program.name],
  capabilities: [{ name: audioProgramCapabilities.render.name, returns: mediaTypes.timelineAudio }],
  producers: [
    {
      name: audioProgramProducers.compile.name,
      inputs: [{ name: "composition", type: compositionTypes.composition }],
      result: { kind: "output", name: "program", type: audioProgramTypes.program },
    },
    {
      name: audioProgramProducers.render.name,
      inputs: [{ name: "program", type: audioProgramTypes.program }],
      result: { kind: "need", name: "audio", capability: audioProgramCapabilities.render },
    },
    {
      name: audioProgramProducers.renderRange.name,
      inputs: [
        { name: "program", type: audioProgramTypes.program },
        { name: "range", type: timelineTypes.frameSpan },
      ],
      result: { kind: "need", name: "audio", capability: audioProgramCapabilities.render },
    },
  ],
};

export const audioProgramDependency = audioProgramModuleRef;
