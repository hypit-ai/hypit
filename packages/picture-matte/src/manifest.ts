import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const pictureMatteModuleRef = { name: "@hypit/picture-matte", version: "1" } as const;
export const pictureMatteTypes = {
  operatorSpec: { module: pictureMatteModuleRef, name: "PictureMatteOperatorSpec" },
} satisfies Record<string, TypeRef>;
export const pictureMatteProducers = {
  operator: { module: pictureMatteModuleRef, name: "picture-operator" },
} satisfies Record<string, ProducerRef>;
export const pictureMatteOperatorSpecSchema: ValueSchema = { kind: "object", fields: {
  channel: { schema: { kind: "string", enum: ["alpha", "luminance"] } },
  invert: { schema: { kind: "boolean" } },
} };

export const pictureMatteManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: pictureMatteModuleRef.name,
  version: pictureMatteModuleRef.version,
  dependencies: [audiovisualDependency],
  types: [pictureMatteTypes.operatorSpec.name],
  capabilities: [],
  producers: [{
    name: pictureMatteProducers.operator.name,
    inputs: [{ name: "spec", type: pictureMatteTypes.operatorSpec }],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }],
};
