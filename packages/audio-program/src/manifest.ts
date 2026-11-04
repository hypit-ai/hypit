import { audiovisualDependency, signalOperatorProgramSchema } from "@hypit/audiovisual";
import { mediaDependency, mediaTypes, preparedAudioSourceSchema } from "@hypit/media";
import { exactTemporalValueSchema, temporalDependency, temporalMapSchema } from "@hypit/temporal";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const audioProgramModuleRef = { name: "@hypit/audio-program", version: "1" } as const;
export const audioProgramTypes = {
  program: { module: audioProgramModuleRef, name: "AudioProgram" },
  renderRange: { module: audioProgramModuleRef, name: "AudioRenderRange" },
} satisfies Record<string, TypeRef>;
export const audioProgramCapabilities = {
  render: { module: audioProgramModuleRef, name: "render-timeline-audio" },
} satisfies Record<string, CapabilityRef>;
export const audioProgramProducers = {
  render: { module: audioProgramModuleRef, name: "request-audio-render" },
  renderRange: { module: audioProgramModuleRef, name: "request-audio-range" },
} satisfies Record<string, ProducerRef>;

const signalRef: ValueSchema = { kind: "object", fields: {
  node: { schema: { kind: "string", minLength: 1 } },
} };
// ValueSchema intentionally has no recursive reference primitive. The AudioProgram
// owner refinement validates every nested Programme exactly.
const nestedProgramEnvelope: ValueSchema = { kind: "object", allowUnknown: true, fields: {} };
const programMediaSource: ValueSchema = {
  kind: "object",
  fields: {
    id: { schema: { kind: "string", minLength: 1 } },
    source: { schema: preparedAudioSourceSchema },
    preparation: { schema: temporalMapSchema },
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
    media: { schema: programMediaSource },
  } },
  { kind: "object", fields: {
    kind: { schema: { kind: "literal", value: "program" } },
    id: { schema: { kind: "string", minLength: 1 } },
    program: { schema: nestedProgramEnvelope },
    sampling: { schema: temporalMapSchema },
    reconstruction: { schema: signalOperatorProgramSchema, optional: true },
    target: { schema: { kind: "object", fields: {
      start: { schema: exactTemporalValueSchema },
      end: { schema: exactTemporalValueSchema },
    } } },
  } },
  { kind: "object", fields: {
    kind: { schema: { kind: "literal", value: "restrict" } },
    id: { schema: { kind: "string", minLength: 1 } },
    input: { schema: signalRef },
    range: { schema: { kind: "object", fields: {
      start: { schema: exactTemporalValueSchema },
      end: { schema: exactTemporalValueSchema },
    } } },
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
    program: { schema: signalOperatorProgramSchema },
    temporalSupport: { schema: { kind: "object", allowUnknown: true, fields: {} } },
    controlMappings: { schema: { kind: "object", allowUnknown: true, fields: {} } },
  } },
] };
export const audioProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    domain: { schema: { kind: "object", fields: {
      id: { schema: { kind: "string", minLength: 1 } },
      duration: { schema: exactTemporalValueSchema },
    } } },
    sampling: { schema: { kind: "object", fields: {
      sampleRate: { schema: { kind: "number", integer: true, minimum: 1 } },
    } } },
    graph: { schema: { kind: "object", fields: {
      nodes: { schema: { kind: "array", minItems: 1, items: programNode } },
      output: { schema: signalRef },
    } } },
  },
};

export const audioRenderRangeSchema: ValueSchema = {
  kind: "object",
  fields: {
    start: { schema: exactTemporalValueSchema },
    end: { schema: exactTemporalValueSchema },
  },
};

export const audioProgramManifest: ModuleManifest = {
  format: "hypit.module@1",
  ...audioProgramModuleRef,
  dependencies: [audiovisualDependency, mediaDependency, temporalDependency],
  types: Object.values(audioProgramTypes).map((type) => type.name),
  capabilities: [{ name: audioProgramCapabilities.render.name, returns: mediaTypes.timelineAudio }],
  producers: [
    {
      name: audioProgramProducers.render.name,
      inputs: [{ name: "program", type: audioProgramTypes.program }],
      result: { kind: "need", name: "audio", capability: audioProgramCapabilities.render },
    },
    {
      name: audioProgramProducers.renderRange.name,
      inputs: [
        { name: "program", type: audioProgramTypes.program },
        { name: "range", type: audioProgramTypes.renderRange },
      ],
      result: { kind: "need", name: "audio", capability: audioProgramCapabilities.render },
    },
  ],
};

export const audioProgramDependency = audioProgramModuleRef;
