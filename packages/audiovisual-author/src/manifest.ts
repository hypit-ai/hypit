import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

export const audiovisualAuthorModuleRef = {
  name: "@hypit/audiovisual-author",
  version: "1",
} as const;

export const audiovisualAuthorTypes = {
  spec: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorSpec" },
  operatorBinding: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorOperatorBinding" },
  reconstructionBinding: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorReconstructionBinding" },
  sourceBinding: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorSourceBinding" },
  bindingSet: { module: audiovisualAuthorModuleRef, name: "AudiovisualAuthorBindingSet" },
} satisfies Record<string, TypeRef>;

export const audiovisualAuthorProducers = {
  createBindings: { module: audiovisualAuthorModuleRef, name: "create-bindings" },
  appendSource: { module: audiovisualAuthorModuleRef, name: "append-source" },
  appendPictureOperator: { module: audiovisualAuthorModuleRef, name: "append-picture-operator" },
  appendAudioOperator: { module: audiovisualAuthorModuleRef, name: "append-audio-operator" },
  appendReconstruction: { module: audiovisualAuthorModuleRef, name: "append-reconstruction" },
  closeProgram: { module: audiovisualAuthorModuleRef, name: "close-program" },
} satisfies Record<string, ProducerRef>;

export const audiovisualAuthorManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audiovisualAuthorModuleRef.name,
  version: audiovisualAuthorModuleRef.version,
  dependencies: [audiovisualDependency],
  types: Object.values(audiovisualAuthorTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    {
      name: audiovisualAuthorProducers.createBindings.name,
      inputs: [],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendPictureOperator.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.operatorBinding },
        { name: "operator", type: audiovisualTypes.pictureOperator },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendAudioOperator.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.operatorBinding },
        { name: "operator", type: audiovisualTypes.audioOperator },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendReconstruction.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.reconstructionBinding },
        { name: "reconstruction", type: audiovisualTypes.signalReconstruction },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.appendSource.name,
      inputs: [
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
        { name: "binding", type: audiovisualAuthorTypes.sourceBinding },
        { name: "source", type: audiovisualTypes.programSource },
      ],
      result: { kind: "output", name: "bindings", type: audiovisualAuthorTypes.bindingSet },
    },
    {
      name: audiovisualAuthorProducers.closeProgram.name,
      inputs: [
        { name: "spec", type: audiovisualAuthorTypes.spec },
        { name: "bindings", type: audiovisualAuthorTypes.bindingSet },
      ],
      result: { kind: "output", name: "program", type: audiovisualTypes.program },
    },
  ],
};

export const audiovisualAuthorDependency = audiovisualAuthorModuleRef;
