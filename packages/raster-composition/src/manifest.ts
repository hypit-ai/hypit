import type { TypeRef } from "@hypit/hypit/module";
import { blobDependency, blobTypes } from "@hypit/hypit/generation/blob";
import type { CapabilityRef } from "@hypit/hypit/module";
import type { GenerationModuleDefinition } from "@hypit/hypit/generation/build";
import type { ProducerRef } from "@hypit/hypit/module";

export const rasterCompositionModuleRef = { name: "@hypit/raster-composition" } as const;
export const rasterCompositionTypes = {
  options: { module: rasterCompositionModuleRef, name: "RasterCompositionOptions" },
  placement: { module: rasterCompositionModuleRef, name: "RasterLayerPlacement" },
  composition: { module: rasterCompositionModuleRef, name: "RasterComposition" },
} satisfies Record<string, TypeRef>;
export const rasterCompositionCapabilities = {
  render: { module: rasterCompositionModuleRef, name: "render-raster-composition" },
} satisfies Record<string, CapabilityRef>;
export const rasterCompositionProducers = {
  create: { module: rasterCompositionModuleRef, name: "create-raster-composition" },
  append: { module: rasterCompositionModuleRef, name: "append-raster-layer" },
  render: { module: rasterCompositionModuleRef, name: "request-raster-composition" },
} satisfies Record<string, ProducerRef>;

export const rasterCompositionManifest: GenerationModuleDefinition = {
  name: rasterCompositionModuleRef.name,
  dependencies: [blobDependency],
  types: Object.values(rasterCompositionTypes).map((type) => type.name),
  capabilities: [{ name: rasterCompositionCapabilities.render.name, returns: blobTypes.blob }],
  producers: [{
    name: rasterCompositionProducers.create.name,
    inputs: [{ name: "options", type: rasterCompositionTypes.options }],
    result: { kind: "output", name: "composition", type: rasterCompositionTypes.composition },
  }, {
    name: rasterCompositionProducers.append.name,
    inputs: [
      { name: "composition", type: rasterCompositionTypes.composition },
      { name: "source", type: blobTypes.blob },
      { name: "placement", type: rasterCompositionTypes.placement },
    ],
    result: { kind: "output", name: "composition", type: rasterCompositionTypes.composition },
  }, {
    name: rasterCompositionProducers.render.name,
    inputs: [{ name: "composition", type: rasterCompositionTypes.composition }],
    result: { kind: "need", name: "image", capability: rasterCompositionCapabilities.render },
  }],
};
