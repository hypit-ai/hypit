import {
  contractTypes,
  narrativeExcerptSchema,
  synchronizedMediaSchema,
  videoContractDependencies,
} from "@svml/contracts";
import {
  mediaPipelineManifest,
  mediaPipelineModuleRef,
  mediaPipelineTypes,
} from "@svml/media-pipeline";
import { digestOf } from "@svml/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@svml/protocol";
import { speechTakeManifest, speechTakeModuleRef } from "@svml/speech-take";

import {
  appendSpeechSpineTakeImplementationDigest,
  assembleSpeechBasisImplementationDigest,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSetImplementationDigest,
} from "./program.js";

export const speechProgramModuleRef = { name: "@svml/speech-program", version: "0.0.0-dev" } as const;
export const speechSpineSurfaceImplementationDigest = digestOf("@svml/speech-program/spine-surface@1");
export const speechProgramTypes = {
  spineProgram: { module: speechProgramModuleRef, name: "SpeechSpineProgram" },
  spineSet: { module: speechProgramModuleRef, name: "SpeechSpineSet" },
} satisfies Record<string, TypeRef>;
export const speechProgramProducers = {
  createSet: { module: speechProgramModuleRef, name: "create-spine-set" },
  appendTake: { module: speechProgramModuleRef, name: "append-spine-take" },
  compileAudio: { module: speechProgramModuleRef, name: "compile-spine-audio" },
  assembleBasis: { module: speechProgramModuleRef, name: "assemble-speech-basis" },
} satisfies Record<string, ProducerRef>;

const string = { kind: "string", minLength: 1 } as const;
const integer = { kind: "number", integer: true, minimum: 1 } as const;
const digest = { kind: "string", minLength: 71, maxLength: 71 } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object",
  fields,
});
const frameRate = object({ numerator: { schema: integer }, denominator: { schema: integer } });

export const speechSpineProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-spine-program@1" } },
  digest: { schema: digest },
  id: { schema: string },
  frameRate: { schema: frameRate },
});

export const speechSpineSetSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.speech-spine-set@1" } },
  digest: { schema: digest },
  program: { schema: speechSpineProgramSchema },
  takes: { schema: { kind: "array", items: object({
    segment: { schema: narrativeExcerptSchema },
    media: { schema: synchronizedMediaSchema },
  }) } },
  lastAddition: { schema: object({
    previousSetDigest: { schema: digest },
    segmentDigest: { schema: digest },
    mediaDigest: { schema: digest },
  }), optional: true },
});

export const speechProgramManifest: ModuleManifest = {
  format: "svml.module@0",
  name: speechProgramModuleRef.name,
  version: speechProgramModuleRef.version,
  dependencies: [
    videoContractDependencies.narrative,
    videoContractDependencies.media,
    videoContractDependencies.programSpace,
    videoContractDependencies.speech,
    videoContractDependencies.composition,
    { module: mediaPipelineModuleRef, digest: digestOf(mediaPipelineManifest) },
    { module: speechTakeModuleRef, digest: digestOf(speechTakeManifest) },
  ],
  types: [
    { name: speechProgramTypes.spineProgram.name, schema: speechSpineProgramSchema },
    { name: speechProgramTypes.spineSet.name, schema: speechSpineSetSchema },
  ],
  capabilities: [],
  surfaces: [{
    name: "spine",
    tag: "Spine",
    mode: "structured",
    outputs: [speechProgramTypes.spineProgram, mediaPipelineTypes.selectionRequest,
      contractTypes.speechBasis, contractTypes.programSpace, contractTypes.speechAudioBasis,
      contractTypes.visualTrack, contractTypes.audioTrack],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@svml/speech-program/spine-surface",
      digest: speechSpineSurfaceImplementationDigest,
    },
  }],
  producers: [
    {
      name: speechProgramProducers.createSet.name,
      inputs: [{ name: "program", type: speechProgramTypes.spineProgram }],
      outputs: [{ name: "set", type: speechProgramTypes.spineSet }],
      needs: [],
      implementation: { kind: "registered", locator: "@svml/speech-program/create-spine-set", digest: createSpeechSpineSetImplementationDigest },
    },
    {
      name: speechProgramProducers.appendTake.name,
      inputs: [
        { name: "set", type: speechProgramTypes.spineSet },
        { name: "media", type: contractTypes.synchronizedMedia },
        { name: "segment", type: contractTypes.narrativeExcerpt },
      ],
      outputs: [{
        name: "set",
        type: speechProgramTypes.spineSet,
        affinity: [
          { resultPointer: "/lastAddition/previousSetDigest", input: "set", inputPointer: "/digest" },
          { resultPointer: "/lastAddition/mediaDigest", input: "media", inputPointer: "/synchronizedMediaDigest" },
          { resultPointer: "/lastAddition/segmentDigest", input: "segment", inputPointer: "/excerptDigest" },
        ],
      }],
      needs: [],
      implementation: { kind: "registered", locator: "@svml/speech-program/append-spine-take", digest: appendSpeechSpineTakeImplementationDigest },
    },
    {
      name: speechProgramProducers.compileAudio.name,
      inputs: [{ name: "set", type: speechProgramTypes.spineSet }],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
      implementation: { kind: "registered", locator: "@svml/speech-program/compile-spine-audio", digest: compileSpeechSpineAudioImplementationDigest },
    },
    {
      name: speechProgramProducers.assembleBasis.name,
      inputs: [
        { name: "set", type: speechProgramTypes.spineSet },
        { name: "audio", type: contractTypes.timelineAudio },
      ],
      outputs: [{
        name: "basis",
        type: contractTypes.speechBasis,
        affinity: [{ resultPointer: "/audio/digest", input: "audio", inputPointer: "/artifact/digest" }],
      }],
      needs: [],
      implementation: { kind: "registered", locator: "@svml/speech-program/assemble-speech-basis", digest: assembleSpeechBasisImplementationDigest },
    },
  ],
};

export const speechProgramManifestDigest = digestOf(speechProgramManifest);
