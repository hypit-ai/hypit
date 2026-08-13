import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { audioTrackSchema, compositionDependency, compositionTypes, visualTrackSchema } from "@narratage/composition";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { spatialDependency, spatialTypes } from "@narratage/spatial";
import { svsManifest, svsModuleRef } from "@narratage/svs";

import {
  appendFilmAudioTrackImplementationDigest,
  appendFilmVisualTrackImplementationDigest,
  compileFilmCompositionImplementationDigest,
  createFilmTrackSetImplementationDigest,
} from "./program.js";

export const filmModuleRef = { name: "@narratage/film", version: "1" } as const;
export const filmSurfaceImplementationDigest = digestOf("@narratage/film/surface@1");
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
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});

export const filmProgramSchema: ValueSchema = object({

  id: { schema: string },
  clearColor: { schema: string },
});

export const filmTrackSetSchema: ValueSchema = object({

  tracks: {
    schema: {
      kind: "array",
      items: { kind: "oneOf", variants: [visualTrackSchema, audioTrackSchema] },
    },
  },
});

export const filmMarkupSurfaces = [{
    name: "film",
    tag: "Film",
    mode: "structured",
    outputs: [filmTypes.program],
    implementation: {
      digest: filmSurfaceImplementationDigest,
    },
  }] as const;


export const filmManifest: ModuleManifest = {
  format: "svml.module@1",
  name: filmModuleRef.name,
  version: filmModuleRef.version,
  dependencies: [
    programSpaceDependency,
    spatialDependency,
    compositionDependency,
    { module: svsModuleRef, digest: digestOf(svsManifest) },
  ],
  types: [
    { name: filmTypes.program.name, schema: filmProgramSchema },
    { name: filmTypes.trackSet.name, schema: filmTrackSetSchema },
  ],
  capabilities: [],
  producers: [
    {
      name: filmProducers.createTrackSet.name,
      inputs: [],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
      implementation: {
        digest: createFilmTrackSetImplementationDigest,
      },
    },
    {
      name: filmProducers.appendVisualTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "track", type: compositionTypes.visualTrack },
      ],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
      implementation: {
        digest: appendFilmVisualTrackImplementationDigest,
      },
    },
    {
      name: filmProducers.appendAudioTrack.name,
      inputs: [
        { name: "set", type: filmTypes.trackSet },
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "track", type: compositionTypes.audioTrack },
      ],
      outputs: [{ name: "set", type: filmTypes.trackSet }],
      needs: [],
      implementation: {
        digest: appendFilmAudioTrackImplementationDigest,
      },
    },
    {
      name: filmProducers.compileComposition.name,
      inputs: [
        { name: "program", type: filmTypes.program },
        { name: "canvas", type: spatialTypes.canvas },
        { name: "space", type: programSpaceTypes.programSpace },
        { name: "set", type: filmTypes.trackSet },
      ],
      outputs: [{ name: "composition", type: compositionTypes.composition }],
      needs: [],
      implementation: {
        digest: compileFilmCompositionImplementationDigest,
      },
    },
  ],
};

export const filmManifestDigest = digestOf(filmManifest);
