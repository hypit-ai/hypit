import { artifactDependency } from "@hypit/artifact";
import { narrativeDependency, narrativeExcerptSchema, narrativeTypes } from "@hypit/narrative";
import { mediaDependency, mediaTypes, synchronizedMediaSchema } from "@hypit/media";
import { programSpaceDependency, programSpaceTypes } from "@hypit/program-space";
import { speechDependency, speechTypes } from "@hypit/speech";
import { compositionDependency, compositionTypes } from "@hypit/composition";
import {
  mediaPipelineManifest,
  mediaPipelineModuleRef,
  mediaPipelineTypes,
} from "@hypit/media-pipeline";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { speechBasisManifest, speechBasisModuleRef } from "@hypit/speech-basis";
import {
  contentFitSchema,
  spatialDependency,
  spatialFrameSchema,
  spatialTypes,
} from "@hypit/spatial";
import { svsManifest, svsModuleRef } from "@hypit/svs";

export const speechSpineModuleRef = { name: "@hypit/speech-spine", version: "1" } as const;
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

  id: { schema: string },
  frameRate: { schema: frameRate },
});

export const speechSpineSetSchema: ValueSchema = object({

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

  stackingOrder: { schema: { kind: "number", integer: true } },
});

export const speechSpineMarkupSurfaces = [{
    name: "spine",
    tag: "Spine",
    mode: "structured",
    outputs: [speechSpineTypes.spineProgram, speechSpineTypes.visualSpec, spatialTypes.fit,
      mediaPipelineTypes.selectionRequest,
      speechTypes.basis, programSpaceTypes.programSpace, speechTypes.audioBasis,
      compositionTypes.visualTrack, compositionTypes.audioTrack],
  }] as const;


export const speechSpineManifest: ModuleManifest = {
  format: "hypit.module@1",
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
    { module: svsModuleRef },
    { module: mediaPipelineModuleRef },
    { module: speechBasisModuleRef },
  ],
  types: [
    { name: speechSpineTypes.spineProgram.name },
    { name: speechSpineTypes.spineSet.name },
    { name: speechSpineTypes.visualSpec.name },
  ],
  capabilities: [],
  producers: [
    {
      name: speechSpineProducers.createSet.name,
      inputs: [],
      outputs: [{ name: "set", type: speechSpineTypes.spineSet }],
      needs: [],
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
    },
    {
      name: speechSpineProducers.compileAudio.name,
      inputs: [
        { name: "program", type: speechSpineTypes.spineProgram },
        { name: "set", type: speechSpineTypes.spineSet },
      ],
      outputs: [{ name: "plan", type: mediaPipelineTypes.audioProgramPlan }],
      needs: [],
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
    },
  ],
};
