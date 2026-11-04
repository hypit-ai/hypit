import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const timelineModuleRef = { name: "@hypit/timeline", version: "1" } as const;
export const timelineTypes = {
  timeline: { module: timelineModuleRef, name: "Timeline" },
  clock: { module: timelineModuleRef, name: "Clock" },
  frameSpan: { module: timelineModuleRef, name: "FrameSpan" },
  instant: { module: timelineModuleRef, name: "TemporalInstant" },
  window: { module: timelineModuleRef, name: "TemporalWindow" },
  temporalIdentity: { module: timelineModuleRef, name: "TemporalIdentitySpec" },
} satisfies Record<string, TypeRef>;
export const timelineProducers = {
  composeWindow: { module: timelineModuleRef, name: "compose-window" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const positiveInteger = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
export const clockSchema: ValueSchema = object({
  frameRate: { schema: object({
    numerator: { schema: positiveInteger },
    denominator: { schema: positiveInteger },
  }) },
});
export const timelineSchema: ValueSchema = object({
  id: { schema: string },
  ...(clockSchema.kind === "object" ? clockSchema.fields : {}),
  frameCount: { schema: positiveInteger },
});
export const frameSpanSchema: ValueSchema = object({
  startFrame: { schema: { kind: "number", integer: true, minimum: 0 } },
  endFrameExclusive: { schema: positiveInteger },
});
export const temporalInstantSchema: ValueSchema = object({
  id: { schema: string },
  subjectId: { schema: string },
  timelineId: { schema: string },
  frame: { schema: { kind: "number", integer: true, minimum: 0 } },
});
export const temporalWindowSchema: ValueSchema = object({
  id: { schema: string },
  subjectId: { schema: string },
  start: { schema: temporalInstantSchema },
  end: { schema: temporalInstantSchema },
  span: { schema: frameSpanSchema },
});
export const temporalIdentitySchema: ValueSchema = object({ id: { schema: string }, subjectId: { schema: string } });

export const timelineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: timelineModuleRef.name,
  version: timelineModuleRef.version,
  dependencies: [],
  types: [timelineTypes.timeline.name, timelineTypes.clock.name, timelineTypes.frameSpan.name,
    timelineTypes.instant.name, timelineTypes.window.name, timelineTypes.temporalIdentity.name],
  capabilities: [],
  producers: [{
    name: timelineProducers.composeWindow.name,
    inputs: [{ name: "spec", type: timelineTypes.temporalIdentity },
      { name: "start", type: timelineTypes.instant }, { name: "end", type: timelineTypes.instant }],
    result: { kind: "output" as const, name: "window", type: timelineTypes.window },
  }],
};
export const timelineDependency = timelineModuleRef;
