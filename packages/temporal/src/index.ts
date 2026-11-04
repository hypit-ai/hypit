import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
export * from "./domain.js";
export * from "./exact.js";
export * from "./sampling.js";
export * from "./extent.js";
export * from "./map.js";
export * from "./exact-relation.js";
export { parseTemporalDuration } from "./literal.js";
export * from "./relation-literal.js";
export * from "./rate-profile.js";
export * from "./relation.js";
export * from "./sample.js";
export * from "./validation.js";
export type * from "./types.js";

export const temporalModuleRef = { name: "@hypit/temporal", version: "1" } as const;
export const temporalTypes = {
  duration: { module: temporalModuleRef, name: "TemporalDuration" },
  exactValue: { module: temporalModuleRef, name: "ExactTemporalValue" },
  extent: { module: temporalModuleRef, name: "TemporalExtent" },
  frameSpan: { module: temporalModuleRef, name: "FrameSpan" },
  map: { module: temporalModuleRef, name: "TemporalMap" },
  localDomain: { module: temporalModuleRef, name: "LocalTemporalDomain" },
} satisfies Record<string, TypeRef>;
export const temporalProducers = {
  extentFromDomain: { module: temporalModuleRef, name: "extent-from-domain" },
} satisfies Record<string, ProducerRef>;
export const temporalManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: temporalModuleRef.name,
  version: temporalModuleRef.version,
  dependencies: [],
  types: [
    temporalTypes.duration.name,
    temporalTypes.exactValue.name,
    temporalTypes.extent.name,
    temporalTypes.frameSpan.name,
    temporalTypes.map.name,
    temporalTypes.localDomain.name,
  ],
  capabilities: [],
  producers: [
    { name: temporalProducers.extentFromDomain.name,
      inputs: [{ name: "domain", type: temporalTypes.localDomain }],
      result: { kind: "output" as const, name: "extent", type: temporalTypes.extent } },
  ],
};
export const temporalDependency = temporalModuleRef;

export const localTemporalDomainSchema: ValueSchema = object({
  id: { schema: string },
  duration: { schema: object({
    ticks: { schema: string },
    timeBase: { schema: object({
      numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
      denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
    }) },
  }) },
});
export const exactTemporalValueSchema: ValueSchema = object({
  ticks: { schema: string },
  timeBase: { schema: object({
    numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
});
export const temporalExtentSchema: ValueSchema = object({ duration: { schema: exactTemporalValueSchema } });
export const frameSpanSchema: ValueSchema = object({
  startFrame: { schema: { kind: "number", integer: true, minimum: 0 } },
  endFrameExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
});
const temporalRangeSchema: ValueSchema = object({
  start: { schema: exactTemporalValueSchema }, end: { schema: exactTemporalValueSchema },
});
export const temporalRateSchema: ValueSchema = object({
  numerator: { schema: integer }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
});
const temporalRelativePointSchema: ValueSchema = object({
  edge: { schema: { kind: "string", enum: ["start", "end"] } },
  offset: { schema: duration },
});
const temporalRelativeRangeSchema: ValueSchema = object({
  from: { schema: temporalRelativePointSchema }, until: { schema: temporalRelativePointSchema },
});
const temporalRelationSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "rate" } }, target: { schema: temporalRelativeRangeSchema },
    targetAt: { schema: temporalRelativePointSchema }, sourceAt: { schema: temporalRelativePointSchema },
    rate: { schema: temporalRateSchema }, source: { schema: temporalRelativeRangeSchema },
    wrap: { schema: temporalRelativeRangeSchema, optional: true } }),
  object({ kind: { schema: { kind: "literal", value: "fit" } }, target: { schema: temporalRelativeRangeSchema },
    source: { schema: temporalRelativeRangeSchema } }),
  object({ kind: { schema: { kind: "literal", value: "cubic" } }, target: { schema: temporalRelativeRangeSchema },
    sourceAtStart: { schema: temporalRelativePointSchema }, sourceControl1: { schema: temporalRelativePointSchema },
    sourceControl2: { schema: temporalRelativePointSchema }, sourceAtEnd: { schema: temporalRelativePointSchema } }),
] };
export const temporalRelationSpecSchema: ValueSchema = object({
  relations: { schema: { kind: "array", minItems: 1, items: temporalRelationSchema } },
});
const temporalMapPieceSchema: ValueSchema = { kind: "oneOf", variants: [
  object({
    target: { schema: temporalRangeSchema }, sourceAtStart: { schema: exactTemporalValueSchema },
    rate: { schema: temporalRateSchema }, wrap: { schema: temporalRangeSchema, optional: true },
  }),
  object({
    target: { schema: temporalRangeSchema }, sourceAtStart: { schema: exactTemporalValueSchema },
    sourceControl1: { schema: exactTemporalValueSchema }, sourceControl2: { schema: exactTemporalValueSchema },
    sourceAtEnd: { schema: exactTemporalValueSchema },
  }),
] };
export const temporalMapSchema: ValueSchema = object({
  stages: { schema: { kind: "array", minItems: 1, items: object({
    target: { schema: localTemporalDomainSchema }, source: { schema: localTemporalDomainSchema },
    pieces: { schema: { kind: "array", items: temporalMapPieceSchema } },
  }) } },
});
export const temporalDurationSchema: ValueSchema = duration;
