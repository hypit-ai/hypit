import { narrativeDependency, narrativeTypes } from "@narratage/narrative";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { semanticMapDependency, semanticMapTypes } from "@narratage/semantic-map";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import type { Track } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";

import {
  appendFullTextItemImplementationDigest,
  appendSelectedTextItemImplementationDigest,
  compileTextTrackImplementationDigest,
  createTextTrackSetImplementationDigest,
  finalizeTextTrackImplementationDigest,
  renderTextTrackImplementationDigest,
} from "./program.js";

export const textTrackModuleRef = { name: "@narratage/text-track", version: "0.0.0-dev" } as const;
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
  id: { schema: string },
  items: { schema: { kind: "array", minItems: 1, items: textItemSchema } },
});

export const textTrackSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-spec@1" } },
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
});

const textTrackSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.text-track-set@1" } },
  items: { schema: { kind: "array", items: textItemSchema } },
});

export const textTrackSurfaceImplementationDigest = digestOf("@narratage/text-track/track-surface@1");

export const textTrackManifest: ModuleManifest = {
  format: "svml.module@1",
  name: textTrackModuleRef.name,
  version: textTrackModuleRef.version,
  dependencies: [
    programSpaceDependency,
    narrativeDependency,
    semanticMapDependency,
    compositionDependency,
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
      textTrackTypes.set, textTrackTypes.program, compositionTypes.visualTrack],
    implementation: { kind: "trusted-frontend-surface", locator: "@narratage/text-track/track-surface", digest: textTrackSurfaceImplementationDigest },
  }],
  producers: [{
    name: textTrackProducers.createSet.name,
    inputs: [],
    outputs: [{ name: "set", type: textTrackTypes.set }],
    needs: [],
    implementation: { kind: "registered", locator: "@narratage/text-track/create-set", digest: createTextTrackSetImplementationDigest },
  }, {
    name: textTrackProducers.appendFull.name,
    inputs: [
      { name: "set", type: textTrackTypes.set },
      { name: "header", type: textTrackTypes.header },
      { name: "space", type: programSpaceTypes.programSpace },
      { name: "spec", type: textTrackTypes.itemSpec },
    ],
    outputs: [{ name: "set", type: textTrackTypes.set }],
    needs: [],
    implementation: { kind: "registered", locator: "@narratage/text-track/append-full", digest: appendFullTextItemImplementationDigest },
  }, {
    name: textTrackProducers.appendSelected.name,
    inputs: [
      { name: "set", type: textTrackTypes.set },
      { name: "header", type: textTrackTypes.header },
      { name: "map", type: semanticMapTypes.complete },
      { name: "selection", type: narrativeTypes.selection },
      { name: "space", type: programSpaceTypes.programSpace },
      { name: "spec", type: textTrackTypes.itemSpec },
    ],
    outputs: [{ name: "set", type: textTrackTypes.set }],
    needs: [],
    implementation: { kind: "registered", locator: "@narratage/text-track/append-selected", digest: appendSelectedTextItemImplementationDigest },
  }, {
    name: textTrackProducers.finalize.name,
    inputs: [
      { name: "header", type: textTrackTypes.header },
      { name: "set", type: textTrackTypes.set },
    ],
    outputs: [{ name: "program", type: textTrackTypes.program }],
    needs: [],
    implementation: { kind: "registered", locator: "@narratage/text-track/finalize", digest: finalizeTextTrackImplementationDigest },
  }, {
    name: textTrackProducers.compile.name,
    inputs: [
      { name: "space", type: programSpaceTypes.programSpace },
      { name: "spec", type: textTrackTypes.spec },
    ],
    outputs: [{ name: "program", type: textTrackTypes.program }],
    needs: [],
    implementation: { kind: "registered", locator: "@narratage/text-track/compile", digest: compileTextTrackImplementationDigest },
  }, {
    name: textTrackProducers.render.name,
    inputs: [
      { name: "space", type: programSpaceTypes.programSpace },
      { name: "program", type: textTrackTypes.program },
    ],
    outputs: [{ name: "track", type: compositionTypes.visualTrack }],
    needs: [],
    implementation: {
      kind: "registered",
      locator: "@narratage/text-track/render",
      digest: renderTextTrackImplementationDigest,
    },
  }],
};

export const textTrackManifestDigest = digestOf(textTrackManifest);
