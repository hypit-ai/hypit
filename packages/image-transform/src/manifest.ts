import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type {
  CapabilityRef,
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@narratage/protocol";

export const imageTransformModuleRef = { name: "@narratage/image-transform", version: "0.0.0-dev" } as const;
export const imageTransformTypes = {
  program: { module: imageTransformModuleRef, name: "ImageTransformProgram" },
} satisfies Record<string, TypeRef>;
export const imageTransformCapabilities = {
  transform: { module: imageTransformModuleRef, name: "transform-image" },
} satisfies Record<string, CapabilityRef>;
export const imageTransformProducers = {
  request: { module: imageTransformModuleRef, name: "request-image-transform" },
} satisfies Record<string, ProducerRef>;
export const imageTransformImplementationDigests = {
  request: digestOf("@narratage/image-transform/request-image-transform@1"),
  validator: digestOf("@narratage/image-transform/validate-program@1"),
  programSurface: digestOf("@narratage/image-transform/program-surface@1"),
  transformSurface: digestOf("@narratage/image-transform/transform-surface@1"),
} as const;

const number = (minimum?: number, maximum?: number): ValueSchema => ({
  kind: "number",
  ...(minimum === undefined ? {} : { minimum }),
  ...(maximum === undefined ? {} : { maximum }),
});
const integer = (minimum: number, maximum: number): ValueSchema => ({
  kind: "number", integer: true, minimum, maximum,
});
const stringEnum = (values: readonly string[]): ValueSchema => ({ kind: "string", enum: values });
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({
  kind: "object", fields,
});
const color: ValueSchema = { kind: "string", minLength: 7, maxLength: 9 };

const operationSchema: ValueSchema = {
  kind: "oneOf",
  variants: [
    object({
      kind: { schema: { kind: "literal", value: "crop" } },
      unit: { schema: stringEnum(["fraction", "pixel"]) },
      x: { schema: number(0) }, y: { schema: number(0) },
      width: { schema: number(Number.EPSILON) }, height: { schema: number(Number.EPSILON) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "resize" } },
      width: { schema: integer(1, 16_384) }, height: { schema: integer(1, 16_384) },
      fit: { schema: stringEnum(["contain", "cover", "stretch"]) },
      interpolation: { schema: stringEnum(["nearest", "linear", "cubic", "area", "lanczos"]) },
      background: { schema: color, optional: true },
    }),
    object({
      kind: { schema: { kind: "literal", value: "rotate" } },
      degrees: { schema: { kind: "oneOf", variants: [
        { kind: "literal", value: 90 },
        { kind: "literal", value: 180 },
        { kind: "literal", value: 270 },
      ] } },
    }),
    object({
      kind: { schema: { kind: "literal", value: "flip" } },
      axis: { schema: stringEnum(["horizontal", "vertical", "both"]) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "denoise" } },
      method: { schema: { kind: "literal", value: "nlm-ycrcb" } },
      lumaStrength: { schema: number(0, 50) }, chromaStrength: { schema: number(0, 50) },
      templateWindow: { schema: integer(1, 31) }, searchWindow: { schema: integer(1, 63) },
      saturationRecovery: { schema: number(0, 4) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "color" } },
      exposureStops: { schema: number(-8, 8) }, contrast: { schema: number(0, 4) },
      saturation: { schema: number(0, 4) }, temperature: { schema: number(-1, 1) },
      tint: { schema: number(-1, 1) }, gamma: { schema: number(0.1, 10) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "sharpen" } },
      amount: { schema: number(0, 5) }, radius: { schema: number(0.1, 20) },
      threshold: { schema: number(0, 255) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "blur" } },
      sigma: { schema: number(0.1, 100) },
    }),
    object({
      kind: { schema: { kind: "literal", value: "alpha" } },
      mode: { schema: stringEnum(["preserve", "flatten"]) },
      background: { schema: color, optional: true },
    }),
    object({
      kind: { schema: { kind: "literal", value: "encode" } },
      format: { schema: stringEnum(["png", "jpeg", "webp"]) },
      quality: { schema: number(1, 100), optional: true },
      background: { schema: color, optional: true },
    }),
  ],
};

export const imageTransformProgramSchema: ValueSchema = object({
  contract: { schema: { kind: "literal", value: "svml.image-transform-program@1" } },
  operations: { schema: { kind: "array", minItems: 1, items: operationSchema } },
});

export const imageTransformManifest: ModuleManifest = {
  format: "svml.module@1",
  name: imageTransformModuleRef.name,
  version: imageTransformModuleRef.version,
  dependencies: [artifactDependency],
  types: [{
    name: imageTransformTypes.program.name,
    schema: imageTransformProgramSchema,
    validator: {
      abi: "svml.type-validator@1",
      implementation: {
        kind: "registered",
        locator: "@narratage/image-transform/validate-program",
        digest: imageTransformImplementationDigests.validator,
      },
    },
  }],
  capabilities: [{ name: imageTransformCapabilities.transform.name, returns: artifactTypes.blob }],
  surfaces: [{
    name: "program",
    tag: "Program",
    mode: "structured",
    outputs: [imageTransformTypes.program],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/image-transform/program-surface",
      digest: imageTransformImplementationDigests.programSurface,
    },
  }, {
    name: "transform",
    tag: "Transform",
    mode: "structured",
    outputs: [artifactTypes.blob],
    implementation: {
      kind: "trusted-frontend-surface",
      locator: "@narratage/image-transform/transform-surface",
      digest: imageTransformImplementationDigests.transformSurface,
    },
  }],
  producers: [{
    name: imageTransformProducers.request.name,
    inputs: [
      { name: "source", type: artifactTypes.blob },
      { name: "program", type: imageTransformTypes.program },
    ],
    outputs: [],
    needs: [{
      name: "image",
      capability: imageTransformCapabilities.transform,
      returns: artifactTypes.blob,
    }],
    implementation: {
      kind: "registered",
      locator: "@narratage/image-transform/request-image-transform",
      digest: imageTransformImplementationDigests.request,
    },
  }],
};

export const imageTransformManifestDigest = digestOf(imageTransformManifest);
