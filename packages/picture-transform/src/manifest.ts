import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";

export const pictureTransformModuleRef = { name: "@hypit/picture-transform", version: "1" } as const;
export const pictureTransformTypes = {
  state: { module: pictureTransformModuleRef, name: "PictureTransformState" },
  control: { module: pictureTransformModuleRef, name: "PictureTransformControl" },
} satisfies Record<string, TypeRef>;
export const pictureTransformProducers = {
  operator: { module: pictureTransformModuleRef, name: "picture-transform-operator" },
  controlOperator: { module: pictureTransformModuleRef, name: "picture-transform-control-operator" },
} satisfies Record<string, ProducerRef>;

const numberField = { schema: { kind: "number" } } as const;
export const pictureTransformStateSchema: ValueSchema = { kind: "object", fields: {
  translateX: numberField,
  translateY: numberField,
  scaleX: numberField,
  scaleY: numberField,
  rotationDegrees: numberField,
  originX: numberField,
  originY: numberField,
} };

export const pictureTransformManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: pictureTransformModuleRef.name,
  version: pictureTransformModuleRef.version,
  dependencies: [audiovisualDependency],
  types: Object.values(pictureTransformTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    {
      name: pictureTransformProducers.operator.name,
      inputs: [{ name: "state", type: pictureTransformTypes.state }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
    },
    {
      name: pictureTransformProducers.controlOperator.name,
      inputs: [{ name: "control", type: pictureTransformTypes.control }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
    },
  ],
};
