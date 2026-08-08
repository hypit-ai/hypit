import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import type { Track } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

import {
  renderCaptionProgramImplementationDigest,
  renderCaptionTrackImplementationDigest,
} from "./track.js";

export const captionModuleRef = { name: "@narratage/caption", version: "0.0.0-dev" } as const;
export const captionProducers = {
  temporalize: { module: captionModuleRef, name: "temporalize-caption" },
  temporalizePlan: { module: captionModuleRef, name: "temporalize-caption-plan" },
  renderProgram: { module: captionModuleRef, name: "render-caption-program" },
  renderTrack: { module: captionModuleRef, name: "render-caption-track" },
} satisfies Record<string, ProducerRef>;
export const captionTypes = {
  style: { module: captionModuleRef, name: "CaptionStyle" },
  program: { module: captionModuleRef, name: "CaptionProgram" },
  plan: { module: captionModuleRef, name: "CaptionPlan" },
  timedProjection: { module: captionModuleRef, name: "TimedCaptionProjection" },
  trackProgram: { module: captionModuleRef, name: "CaptionTrackProgram" },
} satisfies Record<string, TypeRef>;
export const captionImplementationDigest = digestOf("@narratage/caption/temporalize@1");
export const captionPlanImplementationDigest = digestOf("@narratage/caption/temporalize-plan@2");
export const captionValidatorDigests = {
  style: digestOf("@narratage/caption/validate-style@2"),
  program: digestOf("@narratage/caption/validate-program@2"),
  plan: digestOf("@narratage/caption/validate-plan@2"),
  timedProjection: digestOf("@narratage/caption/validate-timed-projection@2"),
  trackProgram: digestOf("@narratage/caption/validate-track-program@1"),
} as const;
export const captionSurfaceImplementationDigest = digestOf("@narratage/caption/track-surface@2");
export const captionStyleSurfaceImplementationDigest = digestOf("@narratage/caption/style-surface@1");
export const captionProgramSurfaceImplementationDigest = digestOf("@narratage/caption/program-surface@1");

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
): ValueSchema => ({ kind: "object", fields });

const timedCaptionRefinement = object({
  id: { schema: string },
  display: { schema: string },
  displayStart: { schema: integer },
  displayEnd: { schema: integer },
  sourceTokenIds: { schema: { kind: "array", items: string } },
  startSec: { schema: number },
  endSec: { schema: number },
  relation: { schema: { kind: "literal", value: "exact" } },
});
const timedCaptionRegion = object({
  id: { schema: string },
  runId: { schema: string, optional: true },
  styleId: { schema: string, optional: true },
  display: { schema: { kind: "string" } },
  segmentId: { schema: string },
  kind: { schema: { kind: "string", enum: ["identity", "alias", "hidden"] } },
  sourceTokenIds: { schema: { kind: "array", items: string } },
  startSec: { schema: number },
  endSec: { schema: number },
  refinements: { schema: { kind: "array", items: timedCaptionRefinement } },
  fields: { schema: { kind: "array", items: object({
    declarationId: { schema: string },
    atomId: { schema: string },
    value: { schema: string },
  }) }, optional: true },
});
const captionFieldAssignment = object({
  declarationId: { schema: string },
  atomId: { schema: string },
  value: { schema: string },
});
const captionPlannedCue = object({
  id: { schema: string },
  atomIds: { schema: { kind: "array", minItems: 1, items: string } },
  fields: { schema: { kind: "array", items: captionFieldAssignment } },
});
const captionPlannedRun = object({
  id: { schema: string },
  styleId: { schema: string },
  cues: { schema: { kind: "array", minItems: 1, items: captionPlannedCue } },
});
export const captionPlanSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-plan@1" } },
  runs: { schema: { kind: "array", minItems: 1, items: captionPlannedRun } },
});
export const timedCaptionProjectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.timed-caption-projection@1" } },
  text: { schema: { kind: "string" } },
  regions: { schema: { kind: "array", items: timedCaptionRegion } },
});

const captionTrackStyleSchema = object({
    fontFamily: { schema: string },
    fontSizePx: { schema: number },
    fontWeight: { schema: number },
    color: { schema: string },
    backgroundColor: { schema: string, optional: true },
    paddingXPx: { schema: number },
    paddingYPx: { schema: number },
    borderRadiusPx: { schema: number },
    bottomPercent: { schema: number },
    maxWidthPercent: { schema: number },
    leftPercent: { schema: number, optional: true },
    topPercent: { schema: number, optional: true },
    widthPercent: { schema: number, optional: true },
    lineHeight: { schema: number, optional: true },
    textAlign: { schema: { kind: "string", enum: ["left", "center", "right"] } },
  });

export const captionTrackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-track-program@1" } },
  id: { schema: string },
  mode: { schema: { kind: "string", enum: ["whole", "proportional-word", "character-flow"] } },
  stacking: { schema: object({ order: { schema: integer }, tieBreak: { schema: string } }) },
  style: { schema: captionTrackStyleSchema },
});

const captionFieldValueSchema: ValueSchema = {
  kind: "oneOf",
  variants: [
    object({ kind: { schema: { kind: "literal", value: "boolean" } } }),
    object({
      kind: { schema: { kind: "literal", value: "enum" } },
      values: { schema: { kind: "array", minItems: 1, items: string } },
    }),
    object({
      kind: { schema: { kind: "literal", value: "number" } },
      minimum: { schema: { kind: "number" }, optional: true },
      maximum: { schema: { kind: "number" }, optional: true },
    }),
  ],
};
const captionFieldDeclaration = object({
  id: { schema: string },
  value: { schema: captionFieldValueSchema },
  instruction: { schema: string },
  minimumPerCue: { schema: integer },
  maximumPerCue: { schema: integer },
});
export const captionStyleSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-style@1" } },
  id: { schema: string },
  planning: { schema: object({
    cueInstruction: { schema: string },
    fields: { schema: { kind: "array", items: captionFieldDeclaration } },
  }) },
  presentation: { schema: object({
    mode: { schema: { kind: "string", enum: ["whole", "proportional-word", "character-flow"] } },
    stackingOrder: { schema: integer },
    style: { schema: captionTrackStyleSchema },
  }) },
});
const captionDisplayAtom = object({
  id: { schema: string }, index: { schema: integer }, regionId: { schema: string }, segmentId: { schema: string },
  turnId: { schema: string }, role: { schema: string, optional: true }, text: { schema: string },
  displayStart: { schema: integer }, displayEnd: { schema: integer }, sourceTokenStart: { schema: integer },
  sourceTokenEndExclusive: { schema: integer },
  correspondence: { schema: { kind: "string", enum: ["exact", "region-envelope"] } },
});
const captionProgramRun = object({
  id: { schema: string }, styleId: { schema: string },
  atomIds: { schema: { kind: "array", minItems: 1, items: string } },
});
export const captionProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-program@1" } },
  id: { schema: string }, defaultStyleId: { schema: string },
  styles: { schema: { kind: "array", minItems: 1, items: captionStyleSchema } },
  atoms: { schema: { kind: "array", minItems: 1, items: captionDisplayAtom } },
  runs: { schema: { kind: "array", minItems: 1, items: captionProgramRun } },
});

export const captionManifest: ModuleManifest = {
  format: "svml.module@1",
  name: captionModuleRef.name,
  version: captionModuleRef.version,
  dependencies: [
    narrativeDependency,
    programSpaceDependency,
    semanticMapDependency,
    compositionDependency,
  ],
  types: [
    {
      name: captionTypes.style.name,
      schema: captionStyleSchema,
      validator: { abi: "svml.type-validator@1", implementation: {
        kind: "registered", locator: "@narratage/caption/validate-style", digest: captionValidatorDigests.style,
      } },
    },
    {
      name: captionTypes.program.name,
      schema: captionProgramSchema,
      validator: { abi: "svml.type-validator@1", implementation: {
        kind: "registered", locator: "@narratage/caption/validate-program", digest: captionValidatorDigests.program,
      } },
    },
    {
      name: captionTypes.plan.name,
      schema: captionPlanSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@narratage/caption/validate-plan",
          digest: captionValidatorDigests.plan,
        },
      },
    },
    {
      name: captionTypes.timedProjection.name,
      schema: timedCaptionProjectionSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@narratage/caption/validate-timed-projection",
          digest: captionValidatorDigests.timedProjection,
        },
      },
    },
    {
      name: captionTypes.trackProgram.name,
      schema: captionTrackProgramSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@narratage/caption/validate-track-program",
          digest: captionValidatorDigests.trackProgram,
        },
      },
    },
  ],
  capabilities: [],
  surfaces: [
    {
      name: "style", tag: "Style", mode: "structured", outputs: [captionTypes.style],
      implementation: { kind: "trusted-frontend-surface", locator: "@narratage/caption/style-surface", digest: captionStyleSurfaceImplementationDigest },
    },
    {
      name: "program", tag: "Program", mode: "structured", outputs: [captionTypes.program],
      implementation: { kind: "trusted-frontend-surface", locator: "@narratage/caption/program-surface", digest: captionProgramSurfaceImplementationDigest },
    },
    {
      name: "track", tag: "Track", mode: "structured",
      outputs: [captionTypes.trackProgram, compositionTypes.visualTrack],
      implementation: { kind: "trusted-frontend-surface", locator: "@narratage/caption/track-surface", digest: captionSurfaceImplementationDigest },
    },
  ],
  producers: [
    {
      name: captionProducers.temporalize.name,
      inputs: [
        { name: "narrative", type: narrativeTypes.narrative },
        { name: "map", type: semanticMapTypes.complete },
      ],
      outputs: [{ name: "caption", type: captionTypes.timedProjection }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/caption/temporalize",
        digest: captionImplementationDigest,
      },
    },
    {
      name: captionProducers.temporalizePlan.name,
      inputs: [
        { name: "narrative", type: narrativeTypes.narrative },
        { name: "map", type: semanticMapTypes.complete },
        { name: "program", type: captionTypes.program },
        { name: "plan", type: captionTypes.plan },
      ],
      outputs: [{ name: "caption", type: captionTypes.timedProjection }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/caption/temporalize-plan",
        digest: captionPlanImplementationDigest,
      },
    },
    {
      name: captionProducers.renderProgram.name,
      inputs: [
        { name: "caption", type: captionTypes.timedProjection },
        { name: "program", type: captionTypes.program },
        { name: "space", type: programSpaceTypes.programSpace },
      ],
      outputs: [{ name: "track", type: compositionTypes.visualTrack }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/caption/render-program", digest: renderCaptionProgramImplementationDigest },
    },
    {
      name: captionProducers.renderTrack.name,
      inputs: [
        { name: "caption", type: captionTypes.timedProjection },
        { name: "program", type: captionTypes.trackProgram },
        { name: "space", type: programSpaceTypes.programSpace },
      ],
      outputs: [{ name: "track", type: compositionTypes.visualTrack }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@narratage/caption/render-track",
        digest: renderCaptionTrackImplementationDigest,
      },
    },
  ],
};
