import {
  contractTypes,
  programSpaceSchema,
  videoContractDependencies,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

import {
  renderCaptionProgramImplementationDigest,
  renderCaptionTrackImplementationDigest,
} from "./track.js";

export const captionModuleRef = { name: "@svml/caption", version: "0.0.0-dev" } as const;
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
export const captionImplementationDigest = digestOf("@svml/caption/temporalize@1");
export const captionPlanImplementationDigest = digestOf("@svml/caption/temporalize-plan@2");
export const captionValidatorDigests = {
  style: digestOf("@svml/caption/validate-style@2"),
  program: digestOf("@svml/caption/validate-program@2"),
  plan: digestOf("@svml/caption/validate-plan@2"),
  timedProjection: digestOf("@svml/caption/validate-timed-projection@2"),
  trackProgram: digestOf("@svml/caption/validate-track-program@1"),
} as const;
export const captionSurfaceImplementationDigest = digestOf("@svml/caption/track-surface@2");
export const captionStyleSurfaceImplementationDigest = digestOf("@svml/caption/style-surface@1");
export const captionProgramSurfaceImplementationDigest = digestOf("@svml/caption/program-surface@1");

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const object = (
  fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>,
): ValueSchema => ({ kind: "object", fields });

const quality = { kind: "string", enum: ["measured", "derived", "estimated"] } as const;
const timedCaptionRefinement = object({
  id: { schema: string },
  display: { schema: string },
  displayStart: { schema: integer },
  displayEnd: { schema: integer },
  sourceTokenIds: { schema: { kind: "array", items: string } },
  startSec: { schema: number },
  endSec: { schema: number },
  startQuality: { schema: quality },
  endQuality: { schema: quality },
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
  startQuality: { schema: quality },
  endQuality: { schema: quality },
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
  narrativeDigest: { schema: digest },
  captionProgramDigest: { schema: digest },
  planningRequestDigest: { schema: digest },
  runs: { schema: { kind: "array", minItems: 1, items: captionPlannedRun } },
  planDigest: { schema: digest },
});
export const timedCaptionProjectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.timed-caption-projection@1" } },
  programSpace: { schema: programSpaceSchema },
  text: { schema: { kind: "string" } },
  regions: { schema: { kind: "array", items: timedCaptionRegion } },
  projectionDigest: { schema: digest },
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
  digest: { schema: digest },
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
  digest: { schema: digest },
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
  id: { schema: string }, narrativeDigest: { schema: digest }, defaultStyleId: { schema: string },
  styles: { schema: { kind: "array", minItems: 1, items: captionStyleSchema } },
  atoms: { schema: { kind: "array", minItems: 1, items: captionDisplayAtom } },
  runs: { schema: { kind: "array", minItems: 1, items: captionProgramRun } },
  digest: { schema: digest },
});

export const captionManifest: ModuleManifest = {
  format: "svml.module@0",
  name: captionModuleRef.name,
  version: captionModuleRef.version,
  dependencies: [
    videoContractDependencies.narrative,
    videoContractDependencies.programSpace,
    videoContractDependencies.semanticTime,
    videoContractDependencies.composition,
  ],
  types: [
    {
      name: captionTypes.style.name,
      schema: captionStyleSchema,
      validator: { abi: "svml.type-validator@1", implementation: {
        kind: "registered", locator: "@svml/caption/validate-style", digest: captionValidatorDigests.style,
      } },
    },
    {
      name: captionTypes.program.name,
      schema: captionProgramSchema,
      validator: { abi: "svml.type-validator@1", implementation: {
        kind: "registered", locator: "@svml/caption/validate-program", digest: captionValidatorDigests.program,
      } },
    },
    {
      name: captionTypes.plan.name,
      schema: captionPlanSchema,
      validator: {
        abi: "svml.type-validator@1",
        implementation: {
          kind: "registered",
          locator: "@svml/caption/validate-plan",
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
          locator: "@svml/caption/validate-timed-projection",
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
          locator: "@svml/caption/validate-track-program",
          digest: captionValidatorDigests.trackProgram,
        },
      },
    },
  ],
  capabilities: [],
  surfaces: [
    {
      name: "style", tag: "Style", mode: "structured", outputs: [captionTypes.style],
      implementation: { kind: "trusted-frontend-surface", locator: "@svml/caption/style-surface", digest: captionStyleSurfaceImplementationDigest },
    },
    {
      name: "program", tag: "Program", mode: "structured", outputs: [captionTypes.program],
      implementation: { kind: "trusted-frontend-surface", locator: "@svml/caption/program-surface", digest: captionProgramSurfaceImplementationDigest },
    },
    {
      name: "track", tag: "Track", mode: "structured",
      outputs: [captionTypes.trackProgram, contractTypes.visualTrack],
      implementation: { kind: "trusted-frontend-surface", locator: "@svml/caption/track-surface", digest: captionSurfaceImplementationDigest },
    },
  ],
  producers: [
    {
      name: captionProducers.temporalize.name,
      inputs: [
        { name: "narrative", type: contractTypes.narrative },
        { name: "map", type: contractTypes.completeSemanticMap },
      ],
      outputs: [{
        name: "caption",
        type: captionTypes.timedProjection,
        affinity: [
          { resultPointer: "/programSpace/digest", input: "map", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/caption/temporalize",
        digest: captionImplementationDigest,
      },
    },
    {
      name: captionProducers.temporalizePlan.name,
      inputs: [
        { name: "narrative", type: contractTypes.narrative },
        { name: "map", type: contractTypes.completeSemanticMap },
        { name: "program", type: captionTypes.program },
        { name: "plan", type: captionTypes.plan },
      ],
      outputs: [{
        name: "caption",
        type: captionTypes.timedProjection,
        affinity: [
          { resultPointer: "/programSpace/digest", input: "map", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/caption/temporalize-plan",
        digest: captionPlanImplementationDigest,
      },
    },
    {
      name: captionProducers.renderProgram.name,
      inputs: [
        { name: "caption", type: captionTypes.timedProjection },
        { name: "program", type: captionTypes.program },
      ],
      outputs: [{
        name: "track", type: contractTypes.visualTrack,
        affinity: [{ resultPointer: "/programSpaceDigest", input: "caption", inputPointer: "/programSpace/digest" }],
      }],
      needs: [],
      implementation: { kind: "registered", locator: "@svml/caption/render-program", digest: renderCaptionProgramImplementationDigest },
    },
    {
      name: captionProducers.renderTrack.name,
      inputs: [
        { name: "caption", type: captionTypes.timedProjection },
        { name: "program", type: captionTypes.trackProgram },
      ],
      outputs: [{
        name: "track",
        type: contractTypes.visualTrack,
        affinity: [
          { resultPointer: "/programSpaceDigest", input: "caption", inputPointer: "/programSpace/digest" },
        ],
      }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/caption/render-track",
        digest: renderCaptionTrackImplementationDigest,
      },
    },
  ],
};
