import { artifactDependency } from "@narratage/artifact";
import {
  contractTypes,
  narrativeExcerptSchema,
  synchronizedMediaSchema,
  videoContractDependencies,
} from "@narratage/contracts";
import {
  mediaPipelineManifest,
  mediaPipelineModuleRef,
  mediaPipelineTypes,
} from "@narratage/media-pipeline";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { speechTakeManifest, speechTakeModuleRef } from "@narratage/speech-take";

import {
  appendSpeechSpineTakeImplementationDigest,
  assembleSpeechBasisImplementationDigest,
  compileSpeechSpineAudioImplementationDigest,
  createSpeechSpineSetImplementationDigest,
} from "./program.js";

export const speechProgramModuleRef = { name: "@narratage/speech-program", version: "0.0.0-dev" } as const;
export const speechSpineSurfaceImplementationDigest = digestOf("@narratage/speech-program/spine-surface@1");
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

export const speechProgramManifest: ModuleManifest = {
  format: "svml.module@1",
  name: speechProgramModuleRef.name,
  version: speechProgramModuleRef.version,
  dependencies: [
    artifactDependency,
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
      locator: "@narratage/speech-program/spine-surface",
      digest: speechSpineSurfaceImplementationDigest,
    },
  }],
  producers: [
    {
      name: speechProgramProducers.createSet.name,
      inputs: [],
      outputs: [{ name: "set", type: speechProgramTypes.spineSet }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-program/create-spine-set", digest: createSpeechSpineSetImplementationDigest },
    },
    {
      name: speechProgramProducers.appendTake.name,
      inputs: [
        { name: "set", type: speechProgramTypes.spineSet },
        { name: "program", type: speechProgramTypes.spineProgram },
        { name: "media", type: contractTypes.synchronizedMedia },
        { name: "segment", type: contractTypes.narrativeExcerpt },
      ],
      outputs: [{ name: "set", type: speechProgramTypes.spineSet }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-program/append-spine-take", digest: appendSpeechSpineTakeImplementationDigest },
    },
    {
      name: speechProgramProducers.compileAudio.name,
      inputs: [
        { name: "program", type: speechProgramTypes.spineProgram },
        { name: "set", type: speechProgramTypes.spineSet },
      ],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-program/compile-spine-audio", digest: compileSpeechSpineAudioImplementationDigest },
    },
    {
      name: speechProgramProducers.assembleBasis.name,
      inputs: [
        { name: "program", type: speechProgramTypes.spineProgram },
        { name: "set", type: speechProgramTypes.spineSet },
        { name: "audio", type: contractTypes.timelineAudio },
      ],
      outputs: [{ name: "basis", type: contractTypes.speechBasis }],
      needs: [],
      implementation: { kind: "registered", locator: "@narratage/speech-program/assemble-speech-basis", digest: assembleSpeechBasisImplementationDigest },
    },
  ],
};

export const speechProgramManifestDigest = digestOf(speechProgramManifest);
