import { blobDependency, blobTypes } from "@hypit/hypit/blob";
import type { CapabilityRef, ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/hypit/protocol";
import { rasterTransformOperationSchema } from "./schema.js";

export const rasterTransformModuleRef = { name: "@hypit/raster-transform", version: "1" } as const;
export const rasterTransformTypes = {
  program: { module: rasterTransformModuleRef, name: "RasterTransformProgram" },
} satisfies Record<string, TypeRef>;
export const rasterTransformCapabilities = {
  transform: { module: rasterTransformModuleRef, name: "transform-raster" },
} satisfies Record<string, CapabilityRef>;
export const rasterTransformProducers = {
  request: { module: rasterTransformModuleRef, name: "request-raster-transform" },
} satisfies Record<string, ProducerRef>;

export const rasterTransformProgramSchema: ValueSchema = {
  kind: "object",
  fields: { operations: { schema: { kind: "array", minItems: 1, items: rasterTransformOperationSchema } } },
};

export const rasterTransformManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: rasterTransformModuleRef.name,
  version: rasterTransformModuleRef.version,
  dependencies: [blobDependency],
  types: [rasterTransformTypes.program.name],
  capabilities: [{ name: rasterTransformCapabilities.transform.name, returns: blobTypes.blob }],
  producers: [{
    name: rasterTransformProducers.request.name,
    inputs: [
      { name: "source", type: blobTypes.blob },
      { name: "program", type: rasterTransformTypes.program },
    ],
    result: { kind: "need", name: "image", capability: rasterTransformCapabilities.transform },
  }],
};
