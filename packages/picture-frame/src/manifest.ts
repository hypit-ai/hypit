import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const pictureFrameModuleRef = { name: "@hypit/picture-frame" } as const;
export const pictureFrameTypes = {
  treatment: { module: pictureFrameModuleRef, name: "PictureFrameTreatment" },
} satisfies Record<string, TypeRef>;
export const pictureFrameProducers = {
  operator: { module: pictureFrameModuleRef, name: "picture-frame-operator" },
} satisfies Record<string, ProducerRef>;

export const pictureFrameManifest: GenerationModuleDefinition = {
  name: pictureFrameModuleRef.name,
  dependencies: [audiovisualDependency],
  types: Object.values(pictureFrameTypes).map((type) => type.name),
  capabilities: [],
  producers: [{
    name: pictureFrameProducers.operator.name,
    inputs: [{ name: "treatment", type: pictureFrameTypes.treatment }],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }],
};
