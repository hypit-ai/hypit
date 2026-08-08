import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

export const captionModuleRef = { name: "@narratage/caption", version: "0.0.0-dev" } as const;
export const captionProducers = {
  temporalize: { module: captionModuleRef, name: "temporalize-caption" },
  temporalizePlan: { module: captionModuleRef, name: "temporalize-caption-plan" },
} satisfies Record<string, ProducerRef>;
export const captionTypes = {
  style: { module: captionModuleRef, name: "CaptionStyle" },
  program: { module: captionModuleRef, name: "CaptionProgram" },
  plan: { module: captionModuleRef, name: "CaptionPlan" },
  timedProjection: { module: captionModuleRef, name: "TimedCaptionProjection" },
} satisfies Record<string, TypeRef>;
export const captionImplementationDigest = digestOf("@narratage/caption/temporalize@1");
export const captionPlanImplementationDigest = digestOf("@narratage/caption/temporalize-plan@1");
export const captionValidatorDigests = {
  style: digestOf("@narratage/caption/validate-style@1"),
  program: digestOf("@narratage/caption/validate-program@1"),
  plan: digestOf("@narratage/caption/validate-plan@1"),
  timedProjection: digestOf("@narratage/caption/validate-timed-projection@1"),
} as const;
export const captionProgramSurfaceImplementationDigest = digestOf("@narratage/caption/program-surface@1");

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
): ValueSchema => ({ kind: "object", fields });

const captionFieldAssignment = object({
  declarationId: { schema: string }, wordId: { schema: string }, value: { schema: string },
});
const captionPlannedCue = object({
  id: { schema: string },
  wordIds: { schema: { kind: "array", minItems: 1, items: string } },
  fields: { schema: { kind: "array", items: captionFieldAssignment } },
});
const captionPlannedRun = object({
  id: { schema: string }, styleId: { schema: string },
  cues: { schema: { kind: "array", minItems: 1, items: captionPlannedCue } },
});
export const captionPlanSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-plan@1" } },
  runs: { schema: { kind: "array", minItems: 1, items: captionPlannedRun } },
});

const timedCaptionRefinement = object({
  id: { schema: string }, display: { schema: string }, displayStart: { schema: integer },
  displayEnd: { schema: integer }, sourceTokenIds: { schema: { kind: "array", items: string } },
  startSec: { schema: number }, endSec: { schema: number },
  relation: { schema: { kind: "literal", value: "exact" } },
});
const timedCaptionRegion = object({
  id: { schema: string }, runId: { schema: string, optional: true }, styleId: { schema: string, optional: true },
  display: { schema: { kind: "string" } }, segmentId: { schema: string },
  kind: { schema: { kind: "string", enum: ["identity", "alias", "hidden"] } },
  sourceTokenIds: { schema: { kind: "array", items: string } }, startSec: { schema: number },
  endSec: { schema: number }, refinements: { schema: { kind: "array", items: timedCaptionRefinement } },
  wordIds: { schema: { kind: "array", items: string }, optional: true },
  fields: { schema: { kind: "array", items: captionFieldAssignment }, optional: true },
});
export const timedCaptionProjectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.timed-caption-projection@1" } },
  text: { schema: { kind: "string" } }, regions: { schema: { kind: "array", items: timedCaptionRegion } },
});

const captionFieldValueSchema: ValueSchema = {
  kind: "oneOf",
  variants: [
    object({ kind: { schema: { kind: "literal", value: "boolean" } } }),
    object({ kind: { schema: { kind: "literal", value: "enum" } },
      values: { schema: { kind: "array", minItems: 1, items: string } } }),
    object({ kind: { schema: { kind: "literal", value: "number" } },
      minimum: { schema: { kind: "number" }, optional: true },
      maximum: { schema: { kind: "number" }, optional: true } }),
  ],
};
const captionFieldDeclaration = object({
  id: { schema: string }, value: { schema: captionFieldValueSchema }, instruction: { schema: string },
  minimumPerCue: { schema: integer }, maximumPerCue: { schema: integer },
});
export const captionStyleSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-style@1" } },
  id: { schema: string },
  planning: { schema: object({
    cue: { schema: object({
      minimumWords: { schema: integer }, maximumWords: { schema: integer }, instruction: { schema: string },
    }) },
    fields: { schema: { kind: "array", items: captionFieldDeclaration } },
  }) },
  rendering: { schema: object({
    family: { schema: string },
    parameters: { schema: { kind: "object", fields: {}, allowUnknown: true } },
  }) },
});
const captionProgramRun = object({
  id: { schema: string }, styleId: { schema: string },
  wordIds: { schema: { kind: "array", minItems: 1, items: string } },
});
export const captionProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-program@1" } },
  id: { schema: string }, wordSequenceId: { schema: string }, defaultStyleId: { schema: string },
  styles: { schema: { kind: "array", minItems: 1, items: captionStyleSchema } },
  runs: { schema: { kind: "array", minItems: 1, items: captionProgramRun } },
});

export const captionManifest: ModuleManifest = {
  format: "svml.module@1",
  name: captionModuleRef.name,
  version: captionModuleRef.version,
  dependencies: [narrativeDependency, semanticMapDependency],
  types: [
    { name: captionTypes.style.name, schema: captionStyleSchema, validator: { abi: "svml.type-validator@1", implementation: {
      kind: "registered", locator: "@narratage/caption/validate-style", digest: captionValidatorDigests.style,
    } } },
    { name: captionTypes.program.name, schema: captionProgramSchema, validator: { abi: "svml.type-validator@1", implementation: {
      kind: "registered", locator: "@narratage/caption/validate-program", digest: captionValidatorDigests.program,
    } } },
    { name: captionTypes.plan.name, schema: captionPlanSchema, validator: { abi: "svml.type-validator@1", implementation: {
      kind: "registered", locator: "@narratage/caption/validate-plan", digest: captionValidatorDigests.plan,
    } } },
    { name: captionTypes.timedProjection.name, schema: timedCaptionProjectionSchema,
      validator: { abi: "svml.type-validator@1", implementation: {
        kind: "registered", locator: "@narratage/caption/validate-timed-projection",
        digest: captionValidatorDigests.timedProjection,
      } } },
  ],
  capabilities: [],
  surfaces: [{
    name: "program", tag: "Program", mode: "structured", outputs: [captionTypes.program],
    implementation: { kind: "trusted-frontend-surface", locator: "@narratage/caption/program-surface",
      digest: captionProgramSurfaceImplementationDigest },
  }],
  producers: [
    {
      name: captionProducers.temporalize.name,
      inputs: [{ name: "narrative", type: narrativeTypes.narrative }, { name: "map", type: semanticMapTypes.complete }],
      outputs: [{ name: "caption", type: captionTypes.timedProjection }], needs: [],
      implementation: { kind: "registered", locator: "@narratage/caption/temporalize",
        digest: captionImplementationDigest },
    },
    {
      name: captionProducers.temporalizePlan.name,
      inputs: [
        { name: "narrative", type: narrativeTypes.narrative },
        { name: "map", type: semanticMapTypes.complete },
        { name: "words", type: narrativeTypes.captionWordSequence },
        { name: "program", type: captionTypes.program },
        { name: "plan", type: captionTypes.plan },
      ],
      outputs: [{ name: "caption", type: captionTypes.timedProjection }], needs: [],
      implementation: { kind: "registered", locator: "@narratage/caption/temporalize-plan",
        digest: captionPlanImplementationDigest },
    },
  ],
};
