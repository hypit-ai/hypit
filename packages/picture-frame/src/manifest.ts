import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/protocol";

export const pictureFrameModuleRef = { name: "@hypit/picture-frame", version: "1" } as const;
export const pictureFrameTypes = {
  treatment: { module: pictureFrameModuleRef, name: "PictureFrameTreatment" },
} satisfies Record<string, TypeRef>;
export const pictureFrameProducers = {
  operator: { module: pictureFrameModuleRef, name: "picture-frame-operator" },
} satisfies Record<string, ProducerRef>;

export const pictureFrameManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: pictureFrameModuleRef.name,
  version: pictureFrameModuleRef.version,
  dependencies: [audiovisualDependency],
  types: Object.values(pictureFrameTypes).map((type) => type.name),
  capabilities: [],
  producers: [{
    name: pictureFrameProducers.operator.name,
    inputs: [{ name: "treatment", type: pictureFrameTypes.treatment }],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }],
};
