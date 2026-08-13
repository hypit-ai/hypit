import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

export const captionModuleRef = { name: "@narratage/caption", version: "1" } as const;
export const captionProducers = {
  temporalizePlan: { module: captionModuleRef, name: "temporalize-caption-plan" },
} satisfies Record<string, ProducerRef>;
export const captionTypes = {
  style: { module: captionModuleRef, name: "CaptionStyle" },
  program: { module: captionModuleRef, name: "CaptionProgram" },
  plan: { module: captionModuleRef, name: "CaptionPlan" },
  timedProjection: { module: captionModuleRef, name: "TimedCaptionProjection" },
} satisfies Record<string, TypeRef>;
export const captionPlanImplementationDigest = digestOf("@narratage/caption/temporalize-whole-atoms-to-frames-with-mute@1");
export const captionValidatorDigests = {
  style: digestOf("@narratage/caption/validate-style@1"),
  program: digestOf("@narratage/caption/validate-display-program-with-mute@1"),
  plan: digestOf("@narratage/caption/validate-atom-plan@1"),
  timedProjection: digestOf("@narratage/caption/validate-frame-timed-atoms@1"),
} as const;
export const captionProgramSurfaceImplementationDigest = digestOf("@narratage/caption/display-program-surface-with-mute@1");

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
  atomIds: { schema: { kind: "array", minItems: 1, items: string } },
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

const timedCaptionAtom = object({
  atomId: { schema: string }, startFrame: { schema: integer }, endFrameExclusive: { schema: integer },
});
const timedCaptionCue = object({
  id: { schema: string }, styleId: { schema: string },
  startFrame: { schema: integer }, endFrameExclusive: { schema: integer },
  atoms: { schema: { kind: "array", minItems: 1, items: timedCaptionAtom } },
  fields: { schema: { kind: "array", items: captionFieldAssignment } },
});
export const timedCaptionProjectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.timed-caption-projection@1" } },
  displaySequenceId: { schema: string },
  cues: { schema: { kind: "array", items: timedCaptionCue } },
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
  id: { schema: string }, displaySequenceId: { schema: string },
  styles: { schema: { kind: "array", minItems: 1, items: captionStyleSchema } },
  runs: { schema: { kind: "array", minItems: 1, items: captionProgramRun } },
  mutedWordIds: { schema: { kind: "array", items: string } },
});

export const captionMarkupSurfaces = [{
    name: "program", tag: "Program", mode: "structured", outputs: [captionTypes.program],
    implementation: { digest: captionProgramSurfaceImplementationDigest },
  }] as const;


export const captionManifest: ModuleManifest = {
  format: "svml.module@1",
  name: captionModuleRef.name,
  version: captionModuleRef.version,
  dependencies: [narrativeDependency, semanticMapDependency],
  types: [
    { name: captionTypes.style.name, schema: captionStyleSchema, validator: { implementation: {
      digest: captionValidatorDigests.style,
    } } },
    { name: captionTypes.program.name, schema: captionProgramSchema, validator: { implementation: {
      digest: captionValidatorDigests.program,
    } } },
    { name: captionTypes.plan.name, schema: captionPlanSchema, validator: { implementation: {
      digest: captionValidatorDigests.plan,
    } } },
    { name: captionTypes.timedProjection.name, schema: timedCaptionProjectionSchema,
      validator: { implementation: {
        digest: captionValidatorDigests.timedProjection,
      } } },
  ],
  capabilities: [],
  producers: [
    {
      name: captionProducers.temporalizePlan.name,
      inputs: [
        { name: "display", type: narrativeTypes.captionDisplay },
        { name: "correspondence", type: narrativeTypes.captionCorrespondence },
        { name: "map", type: semanticMapTypes.complete },
        { name: "program", type: captionTypes.program },
        { name: "plan", type: captionTypes.plan },
      ],
      outputs: [{ name: "caption", type: captionTypes.timedProjection }], needs: [],
      implementation: { digest: captionPlanImplementationDigest },
    },
  ],
};
