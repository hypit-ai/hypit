import type { ValueSchema } from "@hypit/protocol";

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, {
  readonly schema: ValueSchema;
  readonly optional?: boolean;
}>>): ValueSchema => ({ kind: "object", fields });
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({
    unit: { schema: { kind: "literal", value: "seconds" } },
    numerator: { schema: integer },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  }),
] };
export const exactTemporalValueSchema: ValueSchema = object({
  ticks: { schema: string },
  timeBase: { schema: object({
    numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
});
export const localTemporalDomainSchema: ValueSchema = object({
  id: { schema: string },
  duration: { schema: exactTemporalValueSchema },
});
export const temporalExtentSchema: ValueSchema = object({ duration: { schema: exactTemporalValueSchema } });
export const frameSpanSchema: ValueSchema = object({
  startFrame: { schema: { kind: "number", integer: true, minimum: 0 } },
  endFrameExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
});
export const temporalSamplingGridSchema: ValueSchema = object({
  frameRate: { schema: object({
    numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
});
const temporalRangeSchema: ValueSchema = object({
  start: { schema: exactTemporalValueSchema }, end: { schema: exactTemporalValueSchema },
});
export const temporalRateSchema: ValueSchema = object({
  numerator: { schema: integer },
  denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
});
const temporalRelativePointSchema: ValueSchema = object({
  edge: { schema: { kind: "string", enum: ["start", "end"] } },
  offset: { schema: duration },
});
const temporalRelativeRangeSchema: ValueSchema = object({
  from: { schema: temporalRelativePointSchema }, until: { schema: temporalRelativePointSchema },
});
const temporalRelationSchema: ValueSchema = { kind: "oneOf", variants: [
  object({
    kind: { schema: { kind: "literal", value: "rate" } },
    target: { schema: temporalRelativeRangeSchema },
    targetAt: { schema: temporalRelativePointSchema },
    sourceAt: { schema: temporalRelativePointSchema },
    rate: { schema: temporalRateSchema },
    source: { schema: temporalRelativeRangeSchema },
    wrap: { schema: temporalRelativeRangeSchema, optional: true },
  }),
  object({
    kind: { schema: { kind: "literal", value: "fit" } },
    target: { schema: temporalRelativeRangeSchema },
    source: { schema: temporalRelativeRangeSchema },
  }),
  object({
    kind: { schema: { kind: "literal", value: "cubic" } },
    target: { schema: temporalRelativeRangeSchema },
    sourceAtStart: { schema: temporalRelativePointSchema },
    sourceControl1: { schema: temporalRelativePointSchema },
    sourceControl2: { schema: temporalRelativePointSchema },
    sourceAtEnd: { schema: temporalRelativePointSchema },
  }),
] };
export const temporalRelationSpecSchema: ValueSchema = object({
  relations: { schema: { kind: "array", minItems: 1, items: temporalRelationSchema } },
});
const temporalMapPieceSchema: ValueSchema = { kind: "oneOf", variants: [
  object({
    target: { schema: temporalRangeSchema },
    sourceAtStart: { schema: exactTemporalValueSchema },
    rate: { schema: temporalRateSchema },
    wrap: { schema: temporalRangeSchema, optional: true },
  }),
  object({
    target: { schema: temporalRangeSchema },
    sourceAtStart: { schema: exactTemporalValueSchema },
    sourceControl1: { schema: exactTemporalValueSchema },
    sourceControl2: { schema: exactTemporalValueSchema },
    sourceAtEnd: { schema: exactTemporalValueSchema },
  }),
] };
export const temporalMapSchema: ValueSchema = object({
  stages: { schema: { kind: "array", minItems: 1, items: object({
    target: { schema: localTemporalDomainSchema },
    source: { schema: localTemporalDomainSchema },
    pieces: { schema: { kind: "array", items: temporalMapPieceSchema } },
  }) } },
});
export const temporalMapPointSchema: ValueSchema = object({
  position: { schema: exactTemporalValueSchema },
  side: { schema: { kind: "string", enum: ["before", "after"] } },
});
export const temporalMapRegionSchema: ValueSchema = object({
  start: { schema: temporalMapPointSchema }, end: { schema: temporalMapPointSchema },
});
export const temporalMapPreimageSchema: ValueSchema = object({
  domain: { schema: localTemporalDomainSchema },
  regions: { schema: { kind: "array", items: temporalMapRegionSchema } },
});
export const temporalMapRegionSetSchema = temporalMapPreimageSchema;
export const temporalDurationSchema: ValueSchema = duration;
