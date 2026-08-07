import {
  audioTrackSchema,
  compositionSchema,
  contractTypes,
  videoContractDependencies,
  visualTrackSchema,
} from "@svml/contracts";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";
import { svsManifest, svsModuleRef } from "@svml/svs";

import {
  appendFilmAudioTrackImplementationDigest,
  appendFilmVisualTrackImplementationDigest,
  compileFilmCompositionImplementationDigest,
  createFilmTrackSetImplementationDigest,
} from "./program.js";

export const filmModuleRef = { name: "@svml/film", version: "0.0.0-dev" } as const;
export const filmSurfaceImplementationDigest = digestOf("@svml/film/surface@1");
export const filmTypes = {
  program: { module: filmModuleRef, name: "FilmProgram" },
  trackSet: { module: filmModuleRef, name: "FilmTrackSet" },
} satisfies Record<string, TypeRef>;
export const filmProducers = {
  createTrackSet: { module: filmModuleRef, name: "create-track-set" },
  appendVisualTrack: { module: filmModuleRef, name: "append-visual-track" },
  appendAudioTrack: { module: filmModuleRef, name: "append-audio-track" },
  compileComposition: { module: filmModuleRef, name: "compile-composition" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});

const canvasSchema = object({
  width: { schema: integer },
  height: { schema: integer },
  clearColor: { schema: string },
});
const frameRateSchema = object({
  numerator: { schema: integer },
  denominator: { schema: integer },
});

export const filmProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.film-program@1" } },
  id: { schema: string },
  frameRate: { schema: frameRateSchema },
  canvas: { schema: canvasSchema },
});

export const filmTrackSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.film-track-set@1" } },
  tracks: {
    schema: {
      kind: "array",
      items: { kind: "oneOf", variants: [visualTrackSchema, audioTrackSchema] },
    },
  },
});

export const filmManifest: ModuleManifest = {
  format: "svml.module@1",
  name: filmModuleRef.name,
  version: filmModuleRef.version,
  dependencies: [
    videoContractDependencies.programSpace,
    videoContractDependencies.composition,
    { module: svsModuleRef, digest: digestOf(svsManifest) },
  ],
  types: [
    { name: filmTypes.program.name, schema: filmProgramSchema },
    { name: filmTypes.trackSet.name, schema: filmTrackSetSchema },
  ],
  capabilities: [],
  surfaces: [{
    name: "film",
    tag: "Film",
    mode: "structured",
    outputs: [filmTypes.program],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@svml/film/surface",
      digest: filmSurfaceImplementationDigest,
    },
  }],
  producers: [
    {
      name: filmProducers.createTrackSet.name,
      inputs: [],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/film/create-track-set",
        digest: createFilmTrackSetImplementationDigest,
      },
    },
    {
      name: filmProducers.appendVisualTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "space", type: contractTypes.programSpace },
        { name: "track", type: contractTypes.visualTrack },
      ],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/film/append-visual-track",
        digest: appendFilmVisualTrackImplementationDigest,
      },
    },
    {
      name: filmProducers.appendAudioTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "space", type: contractTypes.programSpace },
        { name: "track", type: contractTypes.audioTrack },
      ],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/film/append-audio-track",
        digest: appendFilmAudioTrackImplementationDigest,
      },
    },
    {
      name: filmProducers.compileComposition.name,
      inputs: [
        { name: "program", type: filmTypes.program },
        { name: "space", type: contractTypes.programSpace },
        { name: "set", type: filmTypes.trackSet },
      ],
      outputs: [{ name: "composition", type: contractTypes.composition }],
      needs: [],
      implementation: {
        kind: "registered",
        locator: "@svml/film/compile-composition",
        digest: compileFilmCompositionImplementationDigest,
      },
    },
  ],
};

export const filmManifestDigest = digestOf(filmManifest);
