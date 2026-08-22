import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { narrativeTypes, narrativeDependency } from "@hypit/narrative";
import { semanticTrackDependency, semanticTrackTypes } from "@hypit/semantic-track";
import { programSpaceDependency } from "@hypit/program-space";

const string = { kind: "string", minLength: 1 } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const integer = { kind: "number", integer: true } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const duration: ValueSchema = { kind: "oneOf", variants: [
  object({ unit: { schema: { kind: "literal", value: "frames" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "milliseconds" } }, value: { schema: integer } }),
  object({ unit: { schema: { kind: "literal", value: "seconds" } }, numerator: { schema: integer }, denominator: { schema: { kind: "number", integer: true, minimum: 1 } } }),
] };
const point: ValueSchema = { kind: "oneOf", variants: [
  ...["program.start", "program.end", "selection.start", "selection.end", "segment.start", "segment.end", "moment.cue"].map((ref) => object({
    ref: { schema: { kind: "literal", value: ref } }, offset: { schema: duration, optional: true },
  })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: duration } }),
] };
const projectionSchema: ValueSchema = object({ start: { schema: point }, end: { schema: point } });
const sourceSchema: ValueSchema = { kind: "oneOf", variants: [
  ...["program", "selection", "segment", "moment"].map((kind) => object({
    kind: { schema: { kind: "literal", value: kind } }, id: { schema: string },
  })),
] };
const frameSpanSchema: ValueSchema = object({
  startFrame: { schema: unsignedInteger },
  endFrameExclusive: { schema: { kind: "number", integer: true, minimum: 1 } },
});

export * from "./location.js";
export * from "./projection.js";
export * from "./schedule.js";
export * from "./sample.js";
export type * from "./types.js";

export const temporalModuleRef = { name: "@hypit/temporal", version: "1" } as const;
export const temporalTypes = {
  windowSpec: { module: temporalModuleRef, name: "TemporalWindowSpec" },
  window: { module: temporalModuleRef, name: "TemporalWindow" },
} satisfies Record<string, TypeRef>;
export const temporalProducers = {
  projectProgram: { module: temporalModuleRef, name: "project-program-window" },
  projectSelection: { module: temporalModuleRef, name: "project-selection-window" },
  projectSegment: { module: temporalModuleRef, name: "project-segment-window" },
  projectMoment: { module: temporalModuleRef, name: "project-moment-window" },
} satisfies Record<string, ProducerRef>;
export const temporalManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: temporalModuleRef.name,
  version: temporalModuleRef.version,
  dependencies: [narrativeDependency, programSpaceDependency, semanticTrackDependency],
  types: [
    { name: temporalTypes.windowSpec.name },
    { name: temporalTypes.window.name },
  ],
  capabilities: [],
  producers: [
    { name: temporalProducers.projectProgram.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "spec", type: temporalTypes.windowSpec }],
      outputs: [{ name: "window", type: temporalTypes.window }], needs: [] },
    { name: temporalProducers.projectSelection.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "selection", type: narrativeTypes.selection }, { name: "spec", type: temporalTypes.windowSpec }],
      outputs: [{ name: "window", type: temporalTypes.window }], needs: [] },
    { name: temporalProducers.projectSegment.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "segment", type: narrativeTypes.excerpt }, { name: "spec", type: temporalTypes.windowSpec }],
      outputs: [{ name: "window", type: temporalTypes.window }], needs: [] },
    { name: temporalProducers.projectMoment.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "moment", type: narrativeTypes.moment }, { name: "spec", type: temporalTypes.windowSpec }],
      outputs: [{ name: "window", type: temporalTypes.window }], needs: [] },
  ],
};
export const temporalDependency = { module: temporalModuleRef } as const;

export const temporalWindowSpecSchema: ValueSchema = object({
  id: { schema: string }, projection: { schema: projectionSchema },
});
export const temporalWindowSchema: ValueSchema = object({
  id: { schema: string }, source: { schema: sourceSchema }, projection: { schema: projectionSchema }, span: { schema: frameSpanSchema },
});
