import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import { rasterCapabilities, rasterDependency, rasterTransformOperationSchema } from "@narratage/raster";
import type {
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@narratage/protocol";

export const imageTransformModuleRef = { name: "@narratage/image-transform", version: "1" } as const;
export const imageTransformTypes = {
  program: { module: imageTransformModuleRef, name: "ImageTransformProgram" },
} satisfies Record<string, TypeRef>;
export const imageTransformProducers = {
  request: { module: imageTransformModuleRef, name: "request-image-transform" },
} satisfies Record<string, ProducerRef>;
export const imageTransformImplementationDigests = {
  request: digestOf("@narratage/image-transform/request-image-transform@1"),
  validator: digestOf("@narratage/image-transform/validate-program@1"),
  programSurface: digestOf("@narratage/image-transform/program-surface@1"),
  transformSurface: digestOf("@narratage/image-transform/transform-surface@1"),
} as const;

export const imageTransformProgramSchema: ValueSchema = { kind: "object", fields: {
  contract: { schema: { kind: "literal", value: "svml.image-transform-program@1" } },
  operations: { schema: { kind: "array", minItems: 1, items: rasterTransformOperationSchema } },
} };

export const imageTransformMarkupSurfaces = [{
    name: "program",
    tag: "Program",
    mode: "structured",
    outputs: [imageTransformTypes.program],
    implementation: {
      digest: imageTransformImplementationDigests.programSurface,
    },
  }, {
    name: "transform",
    tag: "Transform",
    mode: "structured",
    outputs: [artifactTypes.blob],
    implementation: {
      digest: imageTransformImplementationDigests.transformSurface,
    },
  }] as const;


export const imageTransformManifest: ModuleManifest = {
  format: "svml.module@1",
  name: imageTransformModuleRef.name,
  version: imageTransformModuleRef.version,
  dependencies: [artifactDependency, rasterDependency],
  types: [{
    name: imageTransformTypes.program.name,
    schema: imageTransformProgramSchema,
    validator: {
      implementation: {
        digest: imageTransformImplementationDigests.validator,
      },
    },
  }],
  capabilities: [],
  producers: [{
    name: imageTransformProducers.request.name,
    inputs: [
      { name: "source", type: artifactTypes.blob },
      { name: "program", type: imageTransformTypes.program },
    ],
    outputs: [],
    needs: [{
      name: "image",
      capability: rasterCapabilities.execute,
      returns: artifactTypes.blob,
    }],
    implementation: {
      digest: imageTransformImplementationDigests.request,
    },
  }],
};

export const imageTransformManifestDigest = digestOf(imageTransformManifest);
