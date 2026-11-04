import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";

export const visualTreatmentModuleRef = { name: "@hypit/visual-treatment", version: "1" } as const;
export const visualTreatmentTypes = {
  operatorSpec: { module: visualTreatmentModuleRef, name: "VisualTreatmentOperatorSpec" },
} satisfies Record<string, TypeRef>;
export const visualTreatmentProducers = {
  operator: { module: visualTreatmentModuleRef, name: "picture-operator" },
} satisfies Record<string, ProducerRef>;

const number = { kind: "number" } as const;
const unit = { kind: "number", minimum: 0, maximum: 1 } as const;
const easing = { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const state = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => object({
  at: { schema: unit },
  ...fields,
  easing: { schema: easing, optional: true },
});
const states = (items: ValueSchema): ValueSchema => ({ kind: "array", minItems: 1, items });
export const visualTreatmentOperatorSpecSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "transform" } }, states: { schema: states(state({
    x: { schema: number }, y: { schema: number }, scaleX: { schema: number }, scaleY: { schema: number },
    rotation: { schema: number }, originX: { schema: number }, originY: { schema: number },
  })) } }),
  object({ kind: { schema: { kind: "literal", value: "opacity" } }, states: { schema: states(state({ value: { schema: unit } })) } }),
  object({ kind: { schema: { kind: "literal", value: "blur" } }, states: { schema: states(state({ radius: { schema: { kind: "number", minimum: 0 } } })) } }),
  object({ kind: { schema: { kind: "literal", value: "color" } }, states: { schema: states(state({
    brightness: { schema: { kind: "number", minimum: 0 } }, contrast: { schema: { kind: "number", minimum: 0 } },
    saturation: { schema: { kind: "number", minimum: 0 } }, hue: { schema: number },
    grayscale: { schema: unit }, sepia: { schema: unit }, invert: { schema: unit },
  })) } }),
] };

export const visualTreatmentManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: visualTreatmentModuleRef.name,
  version: visualTreatmentModuleRef.version,
  dependencies: [audiovisualDependency, temporalDependency],
  types: [visualTreatmentTypes.operatorSpec.name],
  capabilities: [],
  producers: [{
    name: visualTreatmentProducers.operator.name,
    inputs: [
      { name: "spec", type: visualTreatmentTypes.operatorSpec },
      { name: "domain", type: temporalTypes.localDomain },
    ],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }],
};
