import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { narrativeDependency, narrativeTypes } from "@hypit/narrative";
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
const instant: ValueSchema = { kind: "oneOf", variants: [
  ...["program.start", "program.end", "selection.start", "selection.end", "segment.start", "segment.end", "moment.cue"].map((ref) => object({
    ref: { schema: { kind: "literal", value: ref } }, offset: { schema: duration, optional: true },
  })),
  object({ ref: { schema: { kind: "literal", value: "absolute" } }, at: { schema: duration } }),
] };
const sourceSchema: ValueSchema = { kind: "oneOf", variants: [
  ...["program", "selection", "segment", "moment"].map((kind) => object({
    spaceId: { schema: string }, narrativeId: { schema: string },
    kind: { schema: { kind: "literal", value: kind } }, id: { schema: string },
  })),
] };
const authoritySchema: ValueSchema = { kind: "oneOf", variants: [
  object({
    kind: { schema: { kind: "literal", value: "semantic" } },
    boundary: { schema: { kind: "string", enum: ["start", "end", "cue"] } },
  }),
  object({
    kind: { schema: { kind: "literal", value: "parameter" } },
    binding: { schema: string },
    relation: { schema: { kind: "string", enum: ["direct", "after-start", "before-end"] } },
  }),
  object({ kind: { schema: { kind: "literal", value: "fixed" } } }),
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
  instantSpec: { module: temporalModuleRef, name: "TemporalInstantSpec" },
  instant: { module: temporalModuleRef, name: "TemporalInstant" },
  windowSpec: { module: temporalModuleRef, name: "TemporalWindowSpec" },
  window: { module: temporalModuleRef, name: "TemporalWindow" },
} satisfies Record<string, TypeRef>;
export const temporalProducers = {
  projectProgramInstant: { module: temporalModuleRef, name: "project-program-instant" },
  projectSelectionInstant: { module: temporalModuleRef, name: "project-selection-instant" },
  projectSegmentInstant: { module: temporalModuleRef, name: "project-segment-instant" },
  projectMomentInstant: { module: temporalModuleRef, name: "project-moment-instant" },
  composeWindow: { module: temporalModuleRef, name: "compose-window" },
} satisfies Record<string, ProducerRef>;
export const temporalManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: temporalModuleRef.name,
  version: temporalModuleRef.version,
  dependencies: [narrativeDependency, programSpaceDependency, semanticTrackDependency],
  types: [
    { name: temporalTypes.instantSpec.name },
    { name: temporalTypes.instant.name },
    { name: temporalTypes.windowSpec.name },
    { name: temporalTypes.window.name },
  ],
  capabilities: [],
  producers: [
    { name: temporalProducers.projectProgramInstant.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "spec", type: temporalTypes.instantSpec }],
      outputs: [{ name: "instant", type: temporalTypes.instant }], needs: [] },
    { name: temporalProducers.projectSelectionInstant.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "selection", type: narrativeTypes.selection }, { name: "spec", type: temporalTypes.instantSpec }],
      outputs: [{ name: "instant", type: temporalTypes.instant }], needs: [] },
    { name: temporalProducers.projectSegmentInstant.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "segment", type: narrativeTypes.excerpt }, { name: "spec", type: temporalTypes.instantSpec }],
      outputs: [{ name: "instant", type: temporalTypes.instant }], needs: [] },
    { name: temporalProducers.projectMomentInstant.name,
      inputs: [{ name: "semantic", type: semanticTrackTypes.track }, { name: "moment", type: narrativeTypes.moment }, { name: "spec", type: temporalTypes.instantSpec }],
      outputs: [{ name: "instant", type: temporalTypes.instant }], needs: [] },
    { name: temporalProducers.composeWindow.name,
      inputs: [{ name: "spec", type: temporalTypes.windowSpec }, { name: "start", type: temporalTypes.instant }, { name: "end", type: temporalTypes.instant }],
      outputs: [{ name: "window", type: temporalTypes.window }], needs: [] },
  ],
};
export const temporalDependency = { module: temporalModuleRef } as const;

export const temporalInstantSpecSchema: ValueSchema = object({
  id: { schema: string }, subjectId: { schema: string }, projection: { schema: instant }, authority: { schema: authoritySchema },
});
export const temporalInstantSchema: ValueSchema = object({
  id: { schema: string }, subjectId: { schema: string }, source: { schema: sourceSchema }, projection: { schema: instant },
  authority: { schema: authoritySchema }, frame: { schema: unsignedInteger },
});
export const temporalWindowSpecSchema: ValueSchema = object({ id: { schema: string }, subjectId: { schema: string } });
export const temporalWindowSchema: ValueSchema = object({
  id: { schema: string },
  subjectId: { schema: string },
  start: { schema: temporalInstantSchema },
  end: { schema: temporalInstantSchema },
  span: { schema: frameSpanSchema },
});
