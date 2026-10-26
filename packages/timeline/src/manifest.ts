import type { ModuleManifest, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const timelineModuleRef = { name: "@hypit/timeline", version: "1" } as const;
export const timelineTypes = {
  timeline: { module: timelineModuleRef, name: "Timeline" },
  clock: { module: timelineModuleRef, name: "Clock" },
  frameSpan: { module: timelineModuleRef, name: "FrameSpan" },
} satisfies Record<string, TypeRef>;

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

export const timelineManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: timelineModuleRef.name,
  version: timelineModuleRef.version,
  dependencies: [],
  types: [timelineTypes.timeline.name, timelineTypes.clock.name, timelineTypes.frameSpan.name],
  capabilities: [],
  producers: [],
};
export const timelineDependency = timelineModuleRef;
