import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ValueSchema } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const pictureFilterModuleRef = { name: "@hypit/picture-filter" } as const;
export const pictureFilterTypes = {
  state: { module: pictureFilterModuleRef, name: "PictureFilterState" },
  control: { module: pictureFilterModuleRef, name: "PictureFilterControl" },
} satisfies Record<string, TypeRef>;
export const pictureFilterProducers = {
  operator: { module: pictureFilterModuleRef, name: "picture-filter-operator" },
  controlOperator: { module: pictureFilterModuleRef, name: "picture-filter-control-operator" },
} satisfies Record<string, ProducerRef>;

const field = (minimum?: number, maximum?: number): { readonly schema: ValueSchema } => ({
  schema: { kind: "number", ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }) },
});
export const pictureFilterStateSchema: ValueSchema = { kind: "object", fields: {
  opacity: field(0, 1),
  blurRadius: field(0),
  brightness: field(0),
  contrast: field(0),
  saturation: field(0),
  hue: field(),
  grayscale: field(0, 1),
  sepia: field(0, 1),
  invert: field(0, 1),
} };

export const pictureFilterManifest: GenerationModuleDefinition = {
  name: pictureFilterModuleRef.name,
  dependencies: [audiovisualDependency],
  types: Object.values(pictureFilterTypes).map((type) => type.name),
  capabilities: [],
  producers: [
    {
      name: pictureFilterProducers.operator.name,
      inputs: [{ name: "state", type: pictureFilterTypes.state }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
    },
    {
      name: pictureFilterProducers.controlOperator.name,
      inputs: [{ name: "control", type: pictureFilterTypes.control }],
      result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
    },
  ],
};
