import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { timelineDependency, timelineTypes } from "@hypit/timeline";

const string = { kind: "string", minLength: 1 } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const integer = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
const instant: ValueSchema = { kind: "oneOf", variants: [
  ...["timeline.start", "timeline.end"].map((ref) => object({
    ref: { schema: { kind: "literal", value: ref } }, offset: { schema: duration, optional: true },
  })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: duration }, offset: { schema: duration, optional: true } }),
] };
const frameSpanSchema: ValueSchema = object({
  startFrame: { schema: unsignedInteger },
  endFrameExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
});

export * from "./domain.js";
export * from "./extent.js";
export * from "./projection.js";
export * from "./schedule.js";
export * from "./sample.js";
export type * from "./types.js";

export const temporalModuleRef = { name: "@hypit/temporal", version: "1" } as const;
export const temporalTypes = {
  duration: { module: temporalModuleRef, name: "TemporalDuration" },
  extent: { module: temporalModuleRef, name: "TemporalExtent" },
  shiftSpec: { module: temporalModuleRef, name: "TemporalShiftSpec" },
  localDomain: { module: temporalModuleRef, name: "LocalTemporalDomain" },
  instantSpec: { module: temporalModuleRef, name: "TemporalInstantSpec" },
  instant: { module: temporalModuleRef, name: "TemporalInstant" },
  windowSpec: { module: temporalModuleRef, name: "TemporalWindowSpec" },
  window: { module: temporalModuleRef, name: "TemporalWindow" },
} satisfies Record<string, TypeRef>;
export const temporalProducers = {
  extentFromDomain: { module: temporalModuleRef, name: "extent-from-domain" },
  extentFromDuration: { module: temporalModuleRef, name: "extent-from-duration" },
  shiftInstant: { module: temporalModuleRef, name: "shift-instant" },
  reuseInstant: { module: temporalModuleRef, name: "reuse-instant" },
  projectProgramInstant: { module: temporalModuleRef, name: "project-program-instant" },
  composeWindow: { module: temporalModuleRef, name: "compose-window" },
} satisfies Record<string, ProducerRef>;
export const temporalManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: temporalModuleRef.name,
  version: temporalModuleRef.version,
  dependencies: [timelineDependency],
  types: [
    { name: temporalTypes.duration.name },
    { name: temporalTypes.extent.name },
    { name: temporalTypes.shiftSpec.name },
    { name: temporalTypes.localDomain.name },
    { name: temporalTypes.instantSpec.name },
    { name: temporalTypes.instant.name },
    { name: temporalTypes.windowSpec.name },
    { name: temporalTypes.window.name },
  ],
  capabilities: [],
  producers: [
    { name: temporalProducers.extentFromDomain.name,
      inputs: [{ name: "domain", type: temporalTypes.localDomain }],
      result: { kind: "output" as const, name: "extent", type: temporalTypes.extent } },
    { name: temporalProducers.extentFromDuration.name,
      inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "duration", type: temporalTypes.duration }],
      result: { kind: "output" as const, name: "extent", type: temporalTypes.extent } },
    { name: temporalProducers.shiftInstant.name,
      inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "instant", type: temporalTypes.instant },
        { name: "extent", type: temporalTypes.extent }, { name: "spec", type: temporalTypes.shiftSpec }],
      result: { kind: "output" as const, name: "instant", type: temporalTypes.instant } },
    { name: temporalProducers.reuseInstant.name,
      inputs: [{ name: "instant", type: temporalTypes.instant }],
      result: { kind: "output" as const, name: "instant", type: temporalTypes.instant } },
    { name: temporalProducers.projectProgramInstant.name,
      inputs: [{ name: "timeline", type: timelineTypes.timeline }, { name: "spec", type: temporalTypes.instantSpec }],
      result: { kind: "output" as const, name: "instant", type: temporalTypes.instant } },
    { name: temporalProducers.composeWindow.name,
      inputs: [{ name: "spec", type: temporalTypes.windowSpec }, { name: "start", type: temporalTypes.instant }, { name: "end", type: temporalTypes.instant }],
      result: { kind: "output" as const, name: "window", type: temporalTypes.window } },
  ],
};
export const temporalDependency = { module: temporalModuleRef } as const;

export const localTemporalDomainSchema: ValueSchema = object({
  id: { schema: string },
  frameRate: { schema: object({
    numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
  frameCount: { schema: { kind: "number", integer: true, minimum: 1 } },
});
export const temporalExtentSchema: ValueSchema = object({
  frameRate: { schema: object({
    numerator: { schema: { kind: "number", integer: true, minimum: 1 } },
    denominator: { schema: { kind: "number", integer: true, minimum: 1 } },
  }) },
  frameCount: { schema: unsignedInteger },
});
export const temporalDurationSchema: ValueSchema = duration;
const temporalAuthorParameterSchema: ValueSchema = object({
  binding: { schema: string },
  relation: { schema: { kind: "string", enum: ["direct", "after-start", "before-end"] } },
});
export const temporalShiftSpecSchema: ValueSchema = object({
  id: { schema: string }, subjectId: { schema: string },
  direction: { schema: { kind: "oneOf", variants: [
    { kind: "literal", value: 1 }, { kind: "literal", value: -1 },
  ] } }, author: { schema: temporalAuthorParameterSchema, optional: true },
});
export const temporalInstantSpecSchema: ValueSchema = object({
  id: { schema: string }, subjectId: { schema: string }, projection: { schema: instant },
  author: { schema: temporalAuthorParameterSchema, optional: true },
});
export const temporalInstantSchema: ValueSchema = object({
  id: { schema: string }, subjectId: { schema: string }, timelineId: { schema: string }, frame: { schema: unsignedInteger },
});
export const temporalWindowSpecSchema: ValueSchema = object({ id: { schema: string }, subjectId: { schema: string } });
export const temporalWindowSchema: ValueSchema = object({
  id: { schema: string },
  subjectId: { schema: string },
  start: { schema: temporalInstantSchema },
  end: { schema: temporalInstantSchema },
  span: { schema: frameSpanSchema },
});

export { durationInFrames } from "./rational.js";
