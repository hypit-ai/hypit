import { artifactDependency, artifactTypes } from "@hypit/artifact";
import { rasterCapabilities, rasterDependency, rasterTransformOperationSchema } from "@hypit/raster";
import type {
  ModuleManifest,
  ProducerRef,
  TypeRef,
  ValueSchema,
} from "@hypit/protocol";

export const imageTransformModuleRef = { name: "@hypit/image-transform", version: "1" } as const;
export const imageTransformTypes = {
  program: { module: imageTransformModuleRef, name: "ImageTransformProgram" },
} satisfies Record<string, TypeRef>;
export const imageTransformProducers = {
  request: { module: imageTransformModuleRef, name: "request-image-transform" },
} satisfies Record<string, ProducerRef>;

export const imageTransformProgramSchema: ValueSchema = { kind: "object", fields: {
  operations: { schema: { kind: "array", minItems: 1, items: rasterTransformOperationSchema } },
} };

export const imageTransformMarkupSurfaces = [{
    name: "program",
    tag: "Program",
    mode: "structured",
    outputs: [imageTransformTypes.program],
  }, {
    name: "transform",
    tag: "Transform",
    mode: "structured",
    outputs: [artifactTypes.blob],
  }] as const;


export const imageTransformManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: imageTransformModuleRef.name,
  version: imageTransformModuleRef.version,
  dependencies: [artifactDependency, rasterDependency],
  types: [{
    name: imageTransformTypes.program.name,
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
  }],
};
