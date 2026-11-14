import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ValueSchema } from "@hypit/protocol";
import type { TypeRef } from "@hypit/module";
import type { GenerationModuleDefinition } from "@hypit/generation-build";
import type { ProducerRef } from "@hypit/module";

export const pictureMatteModuleRef = { name: "@hypit/picture-matte" } as const;
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

export const pictureMatteManifest: GenerationModuleDefinition = {
  name: pictureMatteModuleRef.name,
  dependencies: [audiovisualDependency],
  types: [pictureMatteTypes.operatorSpec.name],
  capabilities: [],
  producers: [{
    name: pictureMatteProducers.operator.name,
    inputs: [{ name: "spec", type: pictureMatteTypes.operatorSpec }],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }],
};
