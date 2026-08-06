import {
  contractTypes,
  programSpaceSchema,
  videoContractDependencies,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

import { renderCaptionTrackImplementationDigest } from "./track.js";

export const captionModuleRef = { name: "@svml/caption", version: "0.0.0-dev" } as const;
export const captionProducers = {
  temporalize: { module: captionModuleRef, name: "temporalize-caption" },
  renderTrack: { module: captionModuleRef, name: "render-caption-track" },
} satisfies Record<string, ProducerRef>;
export const captionTypes = {
  timedProjection: { module: captionModuleRef, name: "TimedCaptionProjection" },
  trackProgram: { module: captionModuleRef, name: "CaptionTrackProgram" },
} satisfies Record<string, TypeRef>;
export const captionImplementationDigest = digestOf("@svml/caption/temporalize@1");
export const captionValidatorDigests = {
  timedProjection: digestOf("@svml/caption/validate-timed-projection@1"),
  trackProgram: digestOf("@svml/caption/validate-track-program@1"),
} as const;

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
  display: { schema: { kind: "string" } },
  segmentId: { schema: string },
  kind: { schema: { kind: "string", enum: ["identity", "alias", "hidden"] } },
  sourceTokenIds: { schema: { kind: "array", items: string } },
  startSec: { schema: number },
  endSec: { schema: number },
  startQuality: { schema: quality },
  endQuality: { schema: quality },
  refinements: { schema: { kind: "array", items: timedCaptionRefinement } },
});
export const timedCaptionProjectionSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.timed-caption-projection@1" } },
  programSpace: { schema: programSpaceSchema },
  text: { schema: { kind: "string" } },
  regions: { schema: { kind: "array", items: timedCaptionRegion } },
  projectionDigest: { schema: digest },
});

export const captionTrackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.caption-track-program@1" } },
  digest: { schema: digest },
  id: { schema: string },
  mode: { schema: { kind: "string", enum: ["whole", "proportional-word", "character-flow"] } },
  stacking: { schema: object({ order: { schema: integer }, tieBreak: { schema: string } }) },
  style: { schema: object({
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
    textAlign: { schema: { kind: "string", enum: ["left", "center", "right"] } },
  }) },
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
  surfaces: [],
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
