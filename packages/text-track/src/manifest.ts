import {
  contractTypes,
  programSpaceSchema,
  videoContractDependencies,
  visualTrackSchema,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";

import {
  appendFullTextItemImplementationDigest,
  appendSelectedTextItemImplementationDigest,
  compileTextTrackImplementationDigest,
  createTextTrackSetImplementationDigest,
  finalizeTextTrackImplementationDigest,
  renderTextTrackImplementationDigest,
} from "./program.js";

export const textTrackModuleRef = { name: "@svml/text-track", version: "0.0.0-dev" } as const;
export const textTrackTypes = {
  program: { module: textTrackModuleRef, name: "TextTrackProgram" },
  spec: { module: textTrackModuleRef, name: "TextTrackSpec" },
  header: { module: textTrackModuleRef, name: "TextTrackHeader" },
  itemSpec: { module: textTrackModuleRef, name: "TextItemSpec" },
  set: { module: textTrackModuleRef, name: "TextTrackSet" },
} satisfies Record<string, TypeRef>;
export const textTrackProducers = {
  compile: { module: textTrackModuleRef, name: "compile-text-track" },
  render: { module: textTrackModuleRef, name: "render-text-track" },
  createSet: { module: textTrackModuleRef, name: "create-text-track-set" },
  appendFull: { module: textTrackModuleRef, name: "append-full-text-item" },
  appendSelected: { module: textTrackModuleRef, name: "append-selected-text-item" },
  finalize: { module: textTrackModuleRef, name: "finalize-text-track" },
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

const textAppearanceSchema = object({
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
  letterSpacingPx: { schema: number, optional: true },
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
  appearance: { schema: textAppearanceSchema },
});

export const textTrackProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-program@1" } },
  digest: { schema: digest },
  id: { schema: string },
  programSpaceDigest: { schema: digest },
  items: { schema: { kind: "array", minItems: 1, items: textItemSchema } },
});

export const textTrackSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-spec@1" } },
  digest: { schema: digest },
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: object({
    id: { schema: string },
    text: { schema: string },
    during: { schema: { kind: "literal", value: "full" } },
    z: { schema: signedInteger },
    box: { schema: object({
      xPercent: { schema: number }, yPercent: { schema: number },
      widthPercent: { schema: positiveNumber }, heightPercent: { schema: positiveNumber },
    }) },
    appearance: { schema: textAppearanceSchema },
  }) } },
});

const textTrackHeaderSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-header@1" } },
  id: { schema: string },
  digest: { schema: digest },
});

const textItemSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-item-spec@1" } },
  id: { schema: string },
  text: { schema: string },
  z: { schema: signedInteger },
  box: { schema: object({
    xPercent: { schema: number }, yPercent: { schema: number },
    widthPercent: { schema: positiveNumber }, heightPercent: { schema: positiveNumber },
  }) },
  appearance: { schema: textAppearanceSchema },
  digest: { schema: digest },
});

const textTrackSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-set@1" } },
  id: { schema: string },
  programSpace: { schema: programSpaceSchema },
  items: { schema: { kind: "array", items: textItemSchema } },
  lastAddition: { schema: object({
    previousSetDigest: { schema: digest },
    itemSpecDigest: { schema: digest },
    selectionDigest: { schema: digest, optional: true },
    mapDigest: { schema: digest, optional: true },
  }), optional: true },
  digest: { schema: digest },
});

export const textTrackSurfaceImplementationDigest = digestOf("@svml/text-track/track-surface@2");

export const textTrackManifest: ModuleManifest = {
  format: "svml.module@0",
  name: textTrackModuleRef.name,
  version: textTrackModuleRef.version,
  dependencies: [
    videoContractDependencies.programSpace,
    videoContractDependencies.narrative,
    videoContractDependencies.semanticTime,
    videoContractDependencies.composition,
  ],
  types: [
    { name: textTrackTypes.program.name, schema: textTrackProgramSchema },
    { name: textTrackTypes.spec.name, schema: textTrackSpecSchema },
    { name: textTrackTypes.header.name, schema: textTrackHeaderSchema },
    { name: textTrackTypes.itemSpec.name, schema: textItemSpecSchema },
    { name: textTrackTypes.set.name, schema: textTrackSetSchema },
  ],
  capabilities: [],
  surfaces: [{
    name: "track", tag: "Track", mode: "structured",
    outputs: [textTrackTypes.spec, textTrackTypes.header, textTrackTypes.itemSpec,
      textTrackTypes.set, textTrackTypes.program, contractTypes.visualTrack],
    implementation: { kind: "trusted-frontend-surface", locator: "@svml/text-track/track-surface", digest: textTrackSurfaceImplementationDigest },
  }],
  producers: [{
    name: textTrackProducers.createSet.name,
    inputs: [
      { name: "space", type: contractTypes.programSpace },
      { name: "header", type: textTrackTypes.header },
    ],
    outputs: [{ name: "set", type: textTrackTypes.set }],
    needs: [],
    implementation: { kind: "registered", locator: "@svml/text-track/create-set", digest: createTextTrackSetImplementationDigest },
  }, {
    name: textTrackProducers.appendFull.name,
    inputs: [
      { name: "set", type: textTrackTypes.set },
      { name: "spec", type: textTrackTypes.itemSpec },
    ],
    outputs: [{ name: "set", type: textTrackTypes.set }],
    needs: [],
    implementation: { kind: "registered", locator: "@svml/text-track/append-full", digest: appendFullTextItemImplementationDigest },
  }, {
    name: textTrackProducers.appendSelected.name,
    inputs: [
      { name: "set", type: textTrackTypes.set },
      { name: "map", type: contractTypes.completeSemanticMap },
      { name: "selection", type: contractTypes.narrativeSelection },
      { name: "spec", type: textTrackTypes.itemSpec },
    ],
    outputs: [{ name: "set", type: textTrackTypes.set }],
    needs: [],
    implementation: { kind: "registered", locator: "@svml/text-track/append-selected", digest: appendSelectedTextItemImplementationDigest },
  }, {
    name: textTrackProducers.finalize.name,
    inputs: [{ name: "set", type: textTrackTypes.set }],
    outputs: [{
      name: "program", type: textTrackTypes.program,
      affinity: [{ resultPointer: "/programSpaceDigest", input: "set", inputPointer: "/programSpace/digest" }],
    }],
    needs: [],
    implementation: { kind: "registered", locator: "@svml/text-track/finalize", digest: finalizeTextTrackImplementationDigest },
  }, {
    name: textTrackProducers.compile.name,
    inputs: [
      { name: "space", type: contractTypes.programSpace },
      { name: "spec", type: textTrackTypes.spec },
    ],
    outputs: [{
      name: "program", type: textTrackTypes.program,
      affinity: [{ resultPointer: "/programSpaceDigest", input: "space", inputPointer: "/digest" }],
    }],
    needs: [],
    implementation: { kind: "registered", locator: "@svml/text-track/compile", digest: compileTextTrackImplementationDigest },
  }, {
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
