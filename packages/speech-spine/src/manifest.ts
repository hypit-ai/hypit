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
  contentFitSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialTypes,
} from "@narratage/spatial";
import { svsManifest, svsModuleRef } from "@narratage/svs";

import {
  appendSpeechSpineAudioTakeImplementationDigest,
  appendSpeechSpineVisualTakeImplementationDigest,
  assembleSpeechBasisImplementationDigest,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSetImplementationDigest,
} from "./program.js";

export const speechSpineModuleRef = { name: "@narratage/speech-spine", version: "1" } as const;
export const speechSpineSurfaceImplementationDigest = digestOf("@narratage/speech-spine/spine-surface@1");
export const speechSpineTypes = {
  spineProgram: { module: speechSpineModuleRef, name: "SpeechSpineProgram" },
  spineSet: { module: speechSpineModuleRef, name: "SpeechSpineSet" },
  visualSpec: { module: speechSpineModuleRef, name: "SpeechSpineVisualSpec" },
} satisfies Record<string, TypeRef>;
export const speechSpineProducers = {
  createSet: { module: speechSpineModuleRef, name: "create-spine-set" },
  appendAudioTake: { module: speechSpineModuleRef, name: "append-spine-audio-take" },
  appendVisualTake: { module: speechSpineModuleRef, name: "append-spine-visual-take" },
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
    visual: { schema: object({
      frame: { schema: spatialFrameSchema },
      fit: { schema: contentFitSchema },
      stackingOrder: { schema: { kind: "number", integer: true } },
    }), optional: true },
  }) } },
});

export const speechSpineVisualSpecSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-spine-visual-spec@1" } },
  stackingOrder: { schema: { kind: "number", integer: true } },
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
    spatialDependency,
    { module: svsModuleRef, digest: digestOf(svsManifest) },
    { module: mediaPipelineModuleRef, digest: digestOf(mediaPipelineManifest) },
    { module: speechBasisModuleRef, digest: digestOf(speechBasisManifest) },
  ],
  types: [
    { name: speechSpineTypes.spineProgram.name, schema: speechSpineProgramSchema },
    { name: speechSpineTypes.spineSet.name, schema: speechSpineSetSchema },
    { name: speechSpineTypes.visualSpec.name, schema: speechSpineVisualSpecSchema },
  ],
  capabilities: [],
  surfaces: [{
    name: "spine",
    tag: "Spine",
    mode: "structured",
    outputs: [speechSpineTypes.spineProgram, speechSpineTypes.visualSpec, spatialTypes.fit,
      mediaPipelineTypes.selectionRequest,
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
      name: speechSpineProducers.appendAudioTake.name,
      inputs: [
        { name: "set", type: speechSpineTypes.spineSet },
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "media", type: mediaTypes.synchronized },
        { name: "segment", type: narrativeTypes.excerpt },
      ],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-spine/append-spine-audio-take", digest: appendSpeechSpineAudioTakeImplementationDigest },
    },
    {
      name: speechSpineProducers.appendVisualTake.name,
      inputs: [
        { name: "set", type: speechSpineTypes.spineSet },
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "media", type: mediaTypes.synchronized },
        { name: "segment", type: narrativeTypes.excerpt },
        { name: "frame", type: spatialTypes.frame },
        { name: "fit", type: spatialTypes.fit },
        { name: "visualSpec", type: speechSpineTypes.visualSpec },
      ],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-spine/append-spine-visual-take", digest: appendSpeechSpineVisualTakeImplementationDigest },
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
