import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import { mediaDependency, mediaTypes } from "@hypit/media";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { spatialDependency } from "@hypit/spatial";

export const audiovisualMediaModuleRef = {
  name: "@hypit/audiovisual-media",
  version: "1",
} as const;

export const audiovisualMediaProducers = {
  source: { module: audiovisualMediaModuleRef, name: "prepared-media-source" },
  resolveStillPicture: { module: audiovisualMediaModuleRef, name: "resolve-still-picture" },
  stillPictureSource: { module: audiovisualMediaModuleRef, name: "still-picture-source" },
} satisfies Record<string, ProducerRef>;

export const audiovisualMediaTypes = {
  stillPictureSpec: { module: audiovisualMediaModuleRef, name: "StillPictureSourceSpec" },
  stillPicture: { module: audiovisualMediaModuleRef, name: "StillPictureSource" },
} satisfies Record<string, TypeRef>;

export const audiovisualMediaManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: audiovisualMediaModuleRef.name,
  version: audiovisualMediaModuleRef.version,
  dependencies: [audiovisualDependency, blobDependency, mediaDependency, spatialDependency],
  types: Object.values(audiovisualMediaTypes).map((type) => type.name),
  capabilities: [],
  producers: [{
    name: audiovisualMediaProducers.source.name,
    inputs: [{ name: "media", type: mediaTypes.prepared }],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }, {
    name: audiovisualMediaProducers.resolveStillPicture.name,
    inputs: [
      { name: "spec", type: audiovisualMediaTypes.stillPictureSpec },
      { name: "artifact", type: blobTypes.blob },
      { name: "picture", type: mediaTypes.pictureInterpretation },
    ],
    result: { kind: "output", name: "picture", type: audiovisualMediaTypes.stillPicture },
  }, {
    name: audiovisualMediaProducers.stillPictureSource.name,
    inputs: [{ name: "picture", type: audiovisualMediaTypes.stillPicture }],
    result: { kind: "output", name: "source", type: audiovisualTypes.programSource },
  }],
};

export const audiovisualMediaDependency = audiovisualMediaModuleRef;
