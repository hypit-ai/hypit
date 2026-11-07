import { audioProgramDependency, audioProgramTypes } from "@hypit/audio-program";
import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";
import { mediaDependency, mediaTypes } from "@hypit/media";

export const audiovisualAudioModuleRef = { name: "@hypit/audiovisual-audio", version: "1" } as const;

export const audiovisualAudioTypes = {
  source: { module: audiovisualAudioModuleRef, name: "AudiovisualAudioSource" },
  sourceSet: { module: audiovisualAudioModuleRef, name: "AudiovisualAudioSourceSet" },
  output: { module: audiovisualAudioModuleRef, name: "AudiovisualAudioOutput" },
} satisfies Record<string, TypeRef>;

export const audiovisualAudioProducers = {
  createSources: { module: audiovisualAudioModuleRef, name: "create-sources" },
  appendSource: { module: audiovisualAudioModuleRef, name: "append-source" },
  preparedMediaSource: { module: audiovisualAudioModuleRef, name: "prepared-media-source" },
  programSource: { module: audiovisualAudioModuleRef, name: "program-source" },
  compile: { module: audiovisualAudioModuleRef, name: "compile" },
} satisfies Record<string, ProducerRef>;

export const audiovisualAudioManifest: ModuleManifest = {
  format: "hypit.module@1",
  ...audiovisualAudioModuleRef,
  dependencies: [audioProgramDependency, audiovisualDependency, mediaDependency],
  types: Object.values(audiovisualAudioTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    {
      name: audiovisualAudioProducers.createSources.name,
      inputs: [],
      result: { kind: "output", name: "sources", type: audiovisualAudioTypes.sourceSet },
    },
    {
      name: audiovisualAudioProducers.appendSource.name,
      inputs: [
        { name: "sources", type: audiovisualAudioTypes.sourceSet },
        { name: "source", type: audiovisualAudioTypes.source },
      ],
      result: { kind: "output", name: "sources", type: audiovisualAudioTypes.sourceSet },
    },
    {
      name: audiovisualAudioProducers.preparedMediaSource.name,
      inputs: [
        { name: "media", type: mediaTypes.prepared },
        { name: "output", type: audiovisualAudioTypes.output },
      ],
      result: { kind: "output", name: "source", type: audiovisualAudioTypes.source },
    },
    {
      name: audiovisualAudioProducers.programSource.name,
      inputs: [
        { name: "program", type: audiovisualTypes.program },
        { name: "sources", type: audiovisualAudioTypes.sourceSet },
        { name: "output", type: audiovisualAudioTypes.output },
      ],
      result: { kind: "output", name: "source", type: audiovisualAudioTypes.source },
    },
    {
      name: audiovisualAudioProducers.compile.name,
      inputs: [
        { name: "program", type: audiovisualTypes.program },
        { name: "sources", type: audiovisualAudioTypes.sourceSet },
        { name: "output", type: audiovisualAudioTypes.output },
      ],
      result: { kind: "output", name: "program", type: audioProgramTypes.program },
    },
  ],
};

export const audiovisualAudioDependency = audiovisualAudioModuleRef;
