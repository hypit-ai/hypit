import { artifactDependency, artifactTypes } from "@hypit/artifact";
import type { ModuleManifest, ProducerRef, TypeRef, ValueSchema } from "@hypit/protocol";
import { rasterCapabilities, rasterDependency } from "@hypit/raster";
import { spatialDependency, spatialFrameSchema, spatialTypes } from "@hypit/spatial";

export const imageComposeModuleRef = { name: "@hypit/image-compose", version: "1" } as const;
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

const string = { kind: "string", minLength: 1 } as const;
const number = { kind: "number" } as const;
const object = (fields: Readonly<Record<string, { readonly schema: ValueSchema; readonly optional?: boolean }>>): ValueSchema => ({ kind: "object", fields });
const blob = object({
  kind: { schema: { kind: "literal", value: "blob" } },
  resource: { schema: { kind: "string", minLength: 5, maxLength: 256 } },
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

export const imageComposeMarkupSurfaces = [{
    name: "image", tag: "Image", mode: "structured",
    outputs: [imageComposeTypes.options, imageComposeTypes.layerSpec, artifactTypes.blob],
    vocabulary: {
      summary: "Flattens ordered still-image Layers at explicit rectangular Frames into one PNG Artifact.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this composition so its image can be referenced elsewhere in the Source." },
        { name: "canvas", kind: "reference", required: true, accepts: [spatialTypes.canvas],
          summary: "Chooses the Canvas every Layer is painted onto." },
        { name: "background", kind: "literal", required: false,
          summary: "Sets the color the Canvas is cleared to before the first Layer is painted." },
      ],
      children: [
        { tag: "Layer", cardinality: "many",
          summary: "One image painted into its own Frame, in document order, and empty of children and text.",
          attributes: [
            { name: "source", kind: "reference", required: true, accepts: [artifactTypes.blob],
              summary: "Chooses the image Artifact this Layer paints." },
            { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame],
              summary: "Chooses the Frame on the Canvas the image is painted into." },
            { name: "fit", kind: "literal", required: false, values: ["contain", "cover", "stretch"],
              summary: "Decides how the image is sized to its Frame; defaults to `contain`." },
            { name: "interpolation", kind: "literal", required: false,
              values: ["nearest", "linear", "cubic", "area", "lanczos"],
              summary: "Decides which filter resamples the image while it is scaled; defaults to `lanczos`." },
            { name: "opacity", kind: "literal", required: false,
              summary: "Sets how strongly this Layer covers what is beneath it, from 0 to 1; defaults to 1." },
          ] },
      ],
      ports: [
        { name: "image", type: artifactTypes.blob,
          summary: "The composed picture, a PNG." },
      ],
      example: `<compose:Image id="comparison" canvas={comparison-canvas} background="#EEEAE2FF">
  <compose:Layer source={before.image} frame={before-panel} fit="contain"/>
  <compose:Layer source={after.image} frame={after-panel} fit="contain"/>
</compose:Image>`,
      notes: [
        "`background` is written as `#RRGGBBAA` and defaults to `#00000000`.",
        "The composition requires at least one Layer and holds at most 64.",
        "Child order is paint order, and a Frame that extends beyond the Canvas is clipped.",
        "The operation performs rectangular raster placement only; it does not redesign a scene or create timed layers.",
      ],
    },
  }] as const;


export const imageComposeManifest: ModuleManifest = {
  format: "hypit.module@1",
  name: imageComposeModuleRef.name,
  version: imageComposeModuleRef.version,
  dependencies: [artifactDependency, spatialDependency, rasterDependency],
  types: [
    { name: imageComposeTypes.options.name },
    { name: imageComposeTypes.layerSpec.name },
    { name: imageComposeTypes.layerSet.name },
  ],
  capabilities: [],
  producers: [
    { name: imageComposeProducers.createLayers.name, inputs: [], outputs: [{ name: "layers", type: imageComposeTypes.layerSet }], needs: [] },
    { name: imageComposeProducers.appendLayer.name, inputs: [
      { name: "layers", type: imageComposeTypes.layerSet }, { name: "source", type: artifactTypes.blob },
      { name: "frame", type: spatialTypes.frame }, { name: "spec", type: imageComposeTypes.layerSpec },
    ], outputs: [{ name: "layers", type: imageComposeTypes.layerSet }], needs: [] },
    { name: imageComposeProducers.request.name, inputs: [
      { name: "canvas", type: spatialTypes.canvas }, { name: "options", type: imageComposeTypes.options },
      { name: "layers", type: imageComposeTypes.layerSet },
    ], outputs: [], needs: [{ name: "image", capability: rasterCapabilities.execute, returns: artifactTypes.blob }] },
  ],
};

export const imageComposeDependency = { module: imageComposeModuleRef } as const;
