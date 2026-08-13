import { artifactDependency, artifactTypes } from "@narratage/artifact";
import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@narratage/protocol";
import { rasterCapabilities, rasterDependency } from "@narratage/raster";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@narratage/spatial";

export const imageComposeModuleRef = { name: "@narratage/image-compose", version: "1" } as const;
export const imageComposeTypes = {
  options: { module: imageComposeModuleRef, name: "ImageComposeOptions" },
  layerSpec: { module: imageComposeModuleRef, name: "ImageComposeLayerSpec" },
  layerSet: { module: imageComposeModuleRef, name: "ImageComposeLayerSet" },
} satisfies Record<string, TypeRef>;
export const imageComposeProducers = {
  createLayers: { module: imageComposeModuleRef, name: "create-image-compose-layers" },
  appendLayer: { module: imageComposeModuleRef, name: "append-image-compose-layer" },
  request: { module: imageComposeModuleRef, name: "request-image-compose" },
} satisfies Record<string, ProducerRef>;
export const imageComposeImplementationDigests = {
  createLayers: digestOf("@narratage/image-compose/create-layers@1"),
  appendLayer: digestOf("@narratage/image-compose/append-layer@1"),
  request: digestOf("@narratage/image-compose/request@1"),
  validateOptions: digestOf("@narratage/image-compose/validate-options@1"),
  validateLayerSpec: digestOf("@narratage/image-compose/validate-layer-spec@1"),
  validateLayerSet: digestOf("@narratage/image-compose/validate-layer-set@1"),
  surface: digestOf("@narratage/image-compose/image-surface@1"),
} as const;

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blob = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  digest: { schema: { kind: "string", minLength: 71, maxLength: 71 } },
  size: { schema: { kind: "number", integer: true, minimum: 0 } },
  mediaType: { schema: string },
});
export const imageComposeOptionsSchema: ValueSchema = object({

  background: { schema: string },
});
export const imageComposeLayerSpecSchema: ValueSchema = object({

  fit: { schema: { kind: "string", enum: ["contain", "cover", "stretch"] } },
  interpolation: { schema: { kind: "string", enum: ["nearest", "linear", "cubic", "area", "lanczos"] } },
  opacity: { schema: { kind: "number", minimum: 0, maximum: 1 } },
});
const layer = object({
  source: { schema: blob },
  frame: { schema: spatialFrameSchema },
  spec: { schema: imageComposeLayerSpecSchema },
});
export const imageComposeLayerSetSchema: ValueSchema = object({

  layers: { schema: { kind: "array", maxItems: 64, items: layer } },
});
const registered = (digest: ReturnType<typeof digestOf>) => ({ digest });
const validator = (digest: ReturnType<typeof digestOf>) => ({
  implementation: registered(digest),
});

export const imageComposeMarkupSurfaces = [{
    name: "image", tag: "Image", mode: "structured",
    outputs: [imageComposeTypes.options, imageComposeTypes.layerSpec, artifactTypes.blob],
    implementation: { digest: imageComposeImplementationDigests.surface },
  }] as const;


export const imageComposeManifest: ModuleManifest = {
  format: "svml.module@1",
  name: imageComposeModuleRef.name,
  version: imageComposeModuleRef.version,
  dependencies: [artifactDependency, spatialDependency, rasterDependency],
  types: [
    { name: imageComposeTypes.options.name, schema: imageComposeOptionsSchema,
      validator: validator(imageComposeImplementationDigests.validateOptions) },
    { name: imageComposeTypes.layerSpec.name, schema: imageComposeLayerSpecSchema,
      validator: validator(imageComposeImplementationDigests.validateLayerSpec) },
    { name: imageComposeTypes.layerSet.name, schema: imageComposeLayerSetSchema,
      validator: validator(imageComposeImplementationDigests.validateLayerSet) },
  ],
  capabilities: [],
  producers: [
    { name: imageComposeProducers.createLayers.name, inputs: [], outputs: [{ name: "layers", type: imageComposeTypes.layerSet }], needs: [],
      implementation: registered(imageComposeImplementationDigests.createLayers) },
    { name: imageComposeProducers.appendLayer.name, inputs: [
      { name: "layers", type: imageComposeTypes.layerSet }, { name: "source", type: artifactTypes.blob },
      { name: "frame", type: spatialTypes.frame }, { name: "spec", type: imageComposeTypes.layerSpec },
    ], outputs: [{ name: "layers", type: imageComposeTypes.layerSet }], needs: [],
      implementation: registered(imageComposeImplementationDigests.appendLayer) },
    { name: imageComposeProducers.request.name, inputs: [
      { name: "canvas", type: spatialTypes.canvas }, { name: "options", type: imageComposeTypes.options },
      { name: "layers", type: imageComposeTypes.layerSet },
    ], outputs: [], needs: [{ name: "image", capability: rasterCapabilities.execute, returns: artifactTypes.blob }],
      implementation: registered(imageComposeImplementationDigests.request) },
  ],
};

export const imageComposeManifestDigest = digestOf(imageComposeManifest);
export const imageComposeDependency = { module: imageComposeModuleRef, digest: imageComposeManifestDigest } as const;
