import { audiovisualDependency, audiovisualTypes } from "@hypit/audiovisual";
import { temporalDependency, temporalTypes } from "@hypit/temporal";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";

export const pictureTransitionModuleRef = { name: "@hypit/picture-transition", version: "1" } as const;
export const pictureTransitionTypes = {
  operatorSpec: { module: pictureTransitionModuleRef, name: "PictureTransitionOperatorSpec" },
} satisfies Record<string, TypeRef>;
export const pictureTransitionProducers = {
  operator: { module: pictureTransitionModuleRef, name: "picture-operator" },
} satisfies Record<string, ProducerRef>;

const easing = { kind: "string", enum: ["linear", "ease-in", "ease-out", "ease-in-out"] } as const;
const direction = { kind: "string", enum: ["left", "right", "up", "down"] } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema }>>): ValueSchema => ({ kind: "object", fields });
export const pictureTransitionOperatorSpecSchema: ValueSchema = { kind: "oneOf", variants: [
  object({ kind: { schema: { kind: "literal", value: "cross-dissolve" } }, easing: { schema: easing } }),
  object({ kind: { schema: { kind: "literal", value: "dip-to-color" } }, color: { schema: { kind: "string", minLength: 1 } }, easing: { schema: easing } }),
  object({ kind: { schema: { kind: "literal", value: "push" } }, direction: { schema: direction }, easing: { schema: easing } }),
  object({ kind: { schema: { kind: "literal", value: "slide" } }, direction: { schema: direction }, easing: { schema: easing } }),
  object({ kind: { schema: { kind: "literal", value: "linear-wipe" } }, direction: { schema: direction }, easing: { schema: easing } }),
  object({ kind: { schema: { kind: "literal", value: "iris" } }, shape: { schema: { kind: "string", enum: ["circle", "box", "diamond"] } }, easing: { schema: easing } }),
  object({ kind: { schema: { kind: "literal", value: "zoom-dissolve" } }, strength: { schema: { kind: "number", minimum: 0, maximum: 1 } }, easing: { schema: easing } }),
  object({ kind: { schema: { kind: "literal", value: "blur-dissolve" } }, radius: { schema: { kind: "number", minimum: 0, maximum: 200 } }, easing: { schema: easing } }),
] };

export const pictureTransitionManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: pictureTransitionModuleRef.name,
  version: pictureTransitionModuleRef.version,
  dependencies: [audiovisualDependency, temporalDependency],
  types: [pictureTransitionTypes.operatorSpec.name],
  capabilities: [],
  producers: [{
    name: pictureTransitionProducers.operator.name,
    inputs: [
      { name: "spec", type: pictureTransitionTypes.operatorSpec },
      { name: "domain", type: temporalTypes.localDomain },
    ],
    result: { kind: "output", name: "operator", type: audiovisualTypes.pictureOperator },
  }],
};
