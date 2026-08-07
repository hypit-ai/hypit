import { artifactDependency } from "@narratage/artifact";
import { narrativeDependency, narrativeExcerptSchema, narrativeTypes } from "@narratage/narrative";
import { mediaDependency, mediaTypes, synchronizedMediaSchema } from "@narratage/media";
import { programSpaceDependency, programSpaceTypes } from "@narratage/program-space";
import { speechDependency, speechTypes } from "@narratage/speech";
import { compositionDependency, compositionTypes } from "@narratage/composition";
import {
  mediaPipelineManifest,
  mediaPipelineModuleRef,
  mediaPipelineTypes,
} from "@narratage/media-pipeline";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { speechBasisManifest, speechBasisModuleRef } from "@narratage/speech-basis";

import {
  appendSpeechSpineTakeImplementationDigest,
  assembleSpeechBasisImplementationDigest,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSetImplementationDigest,
} from "./program.js";

export const speechSpineModuleRef = { name: "@narratage/speech-spine", version: "0.0.0-dev" } as const;
export const speechSpineSurfaceImplementationDigest = digestOf("@narratage/speech-spine/spine-surface@1");
export const speechSpineTypes = {
  spineProgram: { module: speechSpineModuleRef, name: "SpeechSpineProgram" },
  spineSet: { module: speechSpineModuleRef, name: "SpeechSpineSet" },
} satisfies Record<string, TypeRef>;
export const speechSpineProducers = {
  createSet: { module: speechSpineModuleRef, name: "create-spine-set" },
  appendTake: { module: speechSpineModuleRef, name: "append-spine-take" },
  compileAudio: { module: speechSpineModuleRef, name: "compile-spine-audio" },
  assembleBasis: { module: speechSpineModuleRef, name: "assemble-speech-basis" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 1 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});
const frameRate = object({ numerator: { schema: integer }, denominator: { schema: integer } });

export const speechSpineProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-spine-program@1" } },
  id: { schema: string },
  frameRate: { schema: frameRate },
});

export const speechSpineSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-spine-set@1" } },
  takes: { schema: { kind: "array", items: object({
    segment: { schema: narrativeExcerptSchema },
    media: { schema: synchronizedMediaSchema },
  }) } },
});

export const speechSpineManifest: ModuleManifest = {
  format: "svml.module@1",
  name: speechSpineModuleRef.name,
  version: speechSpineModuleRef.version,
  dependencies: [
    artifactDependency,
    narrativeDependency,
    mediaDependency,
    programSpaceDependency,
    speechDependency,
    compositionDependency,
    { module: mediaPipelineModuleRef, digest: digestOf(mediaPipelineManifest) },
    { module: speechBasisModuleRef, digest: digestOf(speechBasisManifest) },
  ],
  types: [
    { name: speechSpineTypes.spineProgram.name, schema: speechSpineProgramSchema },
    { name: speechSpineTypes.spineSet.name, schema: speechSpineSetSchema },
  ],
  capabilities: [],
  surfaces: [{
    name: "spine",
    tag: "Spine",
    mode: "structured",
    outputs: [speechSpineTypes.spineProgram, mediaPipelineTypes.selectionRequest,
      speechTypes.basis, programSpaceTypes.programSpace, speechTypes.audioBasis,
      compositionTypes.visualTrack, compositionTypes.audioTrack],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/speech-spine/spine-surface",
      digest: speechSpineSurfaceImplementationDigest,
    },
  }],
  producers: [
    {
      name: speechSpineProducers.createSet.name,
      inputs: [],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-spine/create-spine-set", digest: createSpeechSpineSetImplementationDigest },
    },
    {
      name: speechSpineProducers.appendTake.name,
      inputs: [
        { name: "set", type: speechSpineTypes.spineSet },
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "media", type: mediaTypes.synchronized },
        { name: "segment", type: narrativeTypes.excerpt },
      ],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-spine/append-spine-take", digest: appendSpeechSpineTakeImplementationDigest },
    },
    {
      name: speechSpineProducers.compileAudio.name,
      inputs: [
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "set", type: speechSpineTypes.spineSet },
      ],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-spine/compile-spine-audio", digest: compileSpeechSpineAudioImplementationDigest },
    },
    {
      name: speechSpineProducers.assembleBasis.name,
      inputs: [
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "set", type: speechSpineTypes.spineSet },
        { name: "audio", type: mediaTypes.timelineAudio },
      ],
      outputs: [{ name: "basis", type: speechTypes.basis }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-spine/assemble-speech-basis", digest: assembleSpeechBasisImplementationDigest },
    },
  ],
};

export const speechSpineManifestDigest = digestOf(speechSpineManifest);
