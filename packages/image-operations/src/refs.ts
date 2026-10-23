import type { CapabilityRef, ProducerRef, TypeRef } from "@hypit/hypit/protocol";

export const imageOperationsModuleRef = { name: "@hypit/image-operations", version: "1" } as const;

export const imageOperationsCapabilities = {
  transform: { module: imageOperationsModuleRef, name: "transform-image" },
  compose: { module: imageOperationsModuleRef, name: "compose-image" },
} satisfies Record<string, CapabilityRef>;

export const imageTransformTypes = {
  program: { module: imageOperationsModuleRef, name: "ImageTransformProgram" },
} satisfies Record<string, TypeRef>;

export const imageComposeTypes = {
  options: { module: imageOperationsModuleRef, name: "ImageComposeOptions" },
  layerSpec: { module: imageOperationsModuleRef, name: "ImageComposeLayerSpec" },
  layerSet: { module: imageOperationsModuleRef, name: "ImageComposeLayerSet" },
} satisfies Record<string, TypeRef>;

export const imageTransformProducers = {
  request: { module: imageOperationsModuleRef, name: "request-image-transform" },
} satisfies Record<string, ProducerRef>;

export const imageComposeProducers = {
  createLayers: { module: imageOperationsModuleRef, name: "create-image-compose-layers" },
  appendLayer: { module: imageOperationsModuleRef, name: "append-image-compose-layer" },
  request: { module: imageOperationsModuleRef, name: "request-image-compose" },
} satisfies Record<string, ProducerRef>;

export const imageOperationsDependency = imageOperationsModuleRef;
