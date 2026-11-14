import { blobRefSchema } from "@hypit/protocol";
import type { ValueSchema } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

import { audioType, audiovisualModuleRef, pictureType } from "./identity.js";

export const audiovisualTypes = {
  picture: pictureType,
  audio: audioType,
  pictureOperator: { module: audiovisualModuleRef, name: "PictureOperator" },
  audioOperator: { module: audiovisualModuleRef, name: "AudioOperator" },
  signalReconstruction: { module: audiovisualModuleRef, name: "SignalReconstruction" },
  programSource: { module: audiovisualModuleRef, name: "ProgramSource" },
  program: { module: audiovisualModuleRef, name: "AudiovisualProgram" },
} satisfies Record<string, TypeRef>;

export const audiovisualProducers = {
  programSource: { module: audiovisualModuleRef, name: "program-source" },
} satisfies Record<string, ProducerRef>;

/** Shared schema for an opaque package-owned execution programme. */
export const signalOperatorProgramSchema: ValueSchema = {
  kind: "object",
  fields: {
    format: { schema: { kind: "string", minLength: 1 } },
    payload: { schema: { kind: "object", allowUnknown: true, fields: {} } },
    artifacts: { schema: { kind: "array", items: blobRefSchema() } },
  },
};

export const audiovisualManifest: GenerationModuleDefinition = {
  name: audiovisualModuleRef.name,
  dependencies: [],
  types: Object.values(audiovisualTypes).map((type) => type.name),
  capabilities: [],
  producers: [{
    name: audiovisualProducers.programSource.name,
    inputs: [{ name: "program", type: audiovisualTypes.program }],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }],
};

export const audiovisualDependency = audiovisualModuleRef;
