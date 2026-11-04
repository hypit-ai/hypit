import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { audiovisualMediaDependency, audiovisualMediaTypes } from "@hypit/audiovisual-media";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { htmlProgramModuleRef, htmlProgramTypes } from "@hypit/html-program";
import { mediaDependency, mediaTypes } from "@hypit/media";

export const audiovisualHtmlModuleRef = { name: "@hypit/audiovisual-html", version: "1" } as const;

export const audiovisualHtmlTypes = {
  source: { module: audiovisualHtmlModuleRef, name: "AudiovisualHtmlSource" },
  sourceSet: { module: audiovisualHtmlModuleRef, name: "AudiovisualHtmlSourceSet" },
  output: { module: audiovisualHtmlModuleRef, name: "AudiovisualHtmlOutput" },
} satisfies Record<string, TypeRef>;

export const audiovisualHtmlProducers = {
  createSources: { module: audiovisualHtmlModuleRef, name: "create-sources" },
  appendSource: { module: audiovisualHtmlModuleRef, name: "append-source" },
  preparedMediaSource: { module: audiovisualHtmlModuleRef, name: "prepared-media-source" },
  stillPictureSource: { module: audiovisualHtmlModuleRef, name: "still-picture-source" },
  programSource: { module: audiovisualHtmlModuleRef, name: "program-source" },
  compile: { module: audiovisualHtmlModuleRef, name: "compile" },
} satisfies Record<string, ProducerRef>;

export const audiovisualHtmlManifest: ModuleManifest = {
  format: "hypit.module@1",
  ...audiovisualHtmlModuleRef,
  dependencies: [audiovisualDependency, audiovisualMediaDependency, htmlProgramModuleRef, mediaDependency],
  types: Object.values(audiovisualHtmlTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    {
      name: audiovisualHtmlProducers.createSources.name,
      inputs: [],
      result: { kind: "output", name: "sources", type: audiovisualHtmlTypes.sourceSet },
    },
    {
      name: audiovisualHtmlProducers.appendSource.name,
      inputs: [
        { name: "sources", type: audiovisualHtmlTypes.sourceSet },
        { name: "source", type: audiovisualHtmlTypes.source },
      ],
      result: { kind: "output", name: "sources", type: audiovisualHtmlTypes.sourceSet },
    },
    {
      name: audiovisualHtmlProducers.preparedMediaSource.name,
      inputs: [{ name: "media", type: mediaTypes.prepared }],
      result: { kind: "output", name: "source", type: audiovisualHtmlTypes.source },
    },
    {
      name: audiovisualHtmlProducers.stillPictureSource.name,
      inputs: [{ name: "picture", type: audiovisualMediaTypes.stillPicture }],
      result: { kind: "output", name: "source", type: audiovisualHtmlTypes.source },
    },
    {
      name: audiovisualHtmlProducers.programSource.name,
      inputs: [
        { name: "program", type: audiovisualTypes.program },
        { name: "sources", type: audiovisualHtmlTypes.sourceSet },
      ],
      result: { kind: "output", name: "source", type: audiovisualHtmlTypes.source },
    },
    {
      name: audiovisualHtmlProducers.compile.name,
      inputs: [
        { name: "program", type: audiovisualTypes.program },
        { name: "sources", type: audiovisualHtmlTypes.sourceSet },
        { name: "output", type: audiovisualHtmlTypes.output },
      ],
      result: { kind: "output", name: "program", type: htmlProgramTypes.program },
    },
  ],
};

export const audiovisualHtmlDependency = audiovisualHtmlModuleRef;
