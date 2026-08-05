import {
  contractTypes,
  videoContractDependencies,
  visualTrackSchema,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

import { renderTextTrackImplementationDigest } from "./program.js";

export const textTrackModuleRef = { name: "@svml/text-track", version: "0.0.0-dev" } as const;
export const textTrackTypes = {
  program: { module: textTrackModuleRef, name: "TextTrackProgram" },
} satisfies Record<string, TypeRef>;
export const textTrackProducers = {
  render: { module: textTrackModuleRef, name: "render-text-track" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const positiveNumber = { kind: "number", minimum: 0.000001 } as const;
const unsignedInteger = { kind: "number", integer: true, minimum: 0 } as const;
const signedInteger = { kind: "number", integer: true } as const;
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});

const textItemSchema = object({
  id: { schema: string },
  text: { schema: string },
  span: { schema: object({
    startFrame: { schema: unsignedInteger },
    endFrameExclusive: { schema: unsignedInteger },
  }) },
  z: { schema: signedInteger },
  tieBreak: { schema: string },
  box: { schema: object({
    xPercent: { schema: number },
    yPercent: { schema: number },
    widthPercent: { schema: positiveNumber },
    heightPercent: { schema: positiveNumber },
  }) },
  appearance: { schema: object({
    color: { schema: string },
    fontSizePx: { schema: positiveNumber },
    fontFamily: { schema: string, optional: true },
    fontWeight: { schema: { kind: "number", integer: true, minimum: 1, maximum: 1000 }, optional: true },
    lineHeight: { schema: positiveNumber, optional: true },
    align: { schema: { kind: "string", enum: ["left", "center", "right"] }, optional: true },
    verticalAlign: { schema: { kind: "string", enum: ["top", "center", "bottom"] }, optional: true },
    backgroundColor: { schema: string, optional: true },
    borderRadiusPx: { schema: { kind: "number", minimum: 0 }, optional: true },
    paddingPx: { schema: { kind: "number", minimum: 0 }, optional: true },
  }) },
});

export const textTrackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-program@1" } },
  digest: { schema: digest },
  id: { schema: string },
  programSpaceDigest: { schema: digest },
  items: { schema: { kind: "array", minItems: 1, items: textItemSchema } },
});

export const textTrackManifest: ModuleManifest = {
  format: "svml.module@0",
  name: textTrackModuleRef.name,
  version: textTrackModuleRef.version,
  dependencies: [
    videoContractDependencies.programSpace,
    videoContractDependencies.composition,
  ],
  types: [{ name: textTrackTypes.program.name, schema: textTrackProgramSchema }],
  capabilities: [],
  surfaces: [],
  producers: [{
    name: textTrackProducers.render.name,
    inputs: [
      { name: "space", type: contractTypes.programSpace },
      { name: "program", type: textTrackTypes.program },
    ],
    outputs: [{
      name: "track",
      type: contractTypes.visualTrack,
      affinity: [
        { resultPointer: "/programSpaceDigest", input: "space", inputPointer: "/digest" },
        { resultPointer: "/sources/0/digest", input: "program", inputPointer: "/digest" },
      ],
    }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@svml/text-track/render",
      digest: renderTextTrackImplementationDigest,
    },
  }],
};

export const textTrackManifestDigest = digestOf(textTrackManifest);
