import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const visualMatteModuleRef = { name: "@hypit/visual-matte", version: "1" } as const;
export const visualMatteTypes = {
  operatorSpec: { module: visualMatteModuleRef, name: "VisualMatteOperatorSpec" },
} satisfies Record<string, TypeRef>;
export const visualMatteProducers = {
  operator: { module: visualMatteModuleRef, name: "picture-operator" },
} satisfies Record<string, ProducerRef>;
export const visualMatteOperatorSpecSchema: ValueSchema = { kind: "object", fields: {
  channel: { schema: { kind: "string", enum: ["alpha", "luminance"] } },
  invert: { schema: { kind: "boolean" } },
} };

export const visualMatteManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: visualMatteModuleRef.name,
  version: visualMatteModuleRef.version,
  dependencies: [audiovisualDependency],
  types: [visualMatteTypes.operatorSpec.name],
  capabilities: [],
  producers: [{
    name: visualMatteProducers.operator.name,
    inputs: [{ name: "spec", type: visualMatteTypes.operatorSpec }],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }],
};
