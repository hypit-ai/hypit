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
    vocabulary: {
      summary:
        "Names an ordered list of raster operations and publishes it as a reusable ImageTransformProgram Record.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names the ImageTransformProgram Record this element publishes." },
      ],
      children: [
        { tag: "Crop", cardinality: "many",
          summary: "Cuts a rectangle out of the image, measured in fractions of the frame or in pixels.",
          attributes: [
            { name: "unit", kind: "literal", required: false, values: ["fraction", "pixel"],
              summary: "Decides whether the rectangle is measured in fractions of the frame or in pixels; defaults to `fraction`." },
            { name: "x", kind: "literal", required: true,
              summary: "Sets the left edge of the rectangle." },
            { name: "y", kind: "literal", required: true,
              summary: "Sets the top edge of the rectangle." },
            { name: "width", kind: "literal", required: true,
              summary: "Sets how wide the rectangle is." },
            { name: "height", kind: "literal", required: true,
              summary: "Sets how tall the rectangle is." },
          ] },
        { tag: "Resize", cardinality: "many",
          summary: "Scales the image to a pixel width and height under one fit rule.",
          attributes: [
            { name: "width", kind: "literal", required: true,
              summary: "Sets the width in whole pixels the image is scaled to." },
            { name: "height", kind: "literal", required: true,
              summary: "Sets the height in whole pixels the image is scaled to." },
            { name: "fit", kind: "literal", required: false, values: ["contain", "cover", "stretch"],
              summary: "Decides how the image is sized into that width and height; defaults to `contain`." },
            { name: "interpolation", kind: "literal", required: false,
              values: ["nearest", "linear", "cubic", "area", "lanczos"],
              summary: "Decides which filter resamples the image while it is scaled; defaults to `lanczos`." },
            { name: "background", kind: "literal", required: false,
              summary: "Sets the hexadecimal color filling the area `contain` leaves empty." },
          ] },
        { tag: "Rotate", cardinality: "many",
          summary: "Turns the image by 90, 180 or 270 degrees.",
          attributes: [
            { name: "degrees", kind: "literal", required: true, values: ["90", "180", "270"],
              summary: "Sets how far the image is turned clockwise." },
          ] },
        { tag: "Flip", cardinality: "many",
          summary: "Mirrors the image across one axis.",
          attributes: [
            { name: "axis", kind: "literal", required: false, values: ["horizontal", "vertical", "both"],
              summary: "Chooses the axis the image is mirrored across; defaults to `horizontal`." },
          ] },
        { tag: "Denoise", cardinality: "many",
          summary: "Removes noise with YCrCb non-local means and recovers saturation.",
          attributes: [
            { name: "method", kind: "literal", required: false, values: ["nlm-ycrcb"],
              summary: "Names the denoising method; defaults to `nlm-ycrcb`." },
            { name: "luma", kind: "literal", required: false,
              summary: "Sets how hard the luma channel is denoised; defaults to 2." },
            { name: "chroma", kind: "literal", required: false,
              summary: "Sets how hard the chroma channels are denoised; defaults to 10." },
            { name: "template-window", kind: "literal", required: false,
              summary: "Sets the odd pixel width of the patch each pixel is compared as; defaults to 7." },
            { name: "search-window", kind: "literal", required: false,
              summary: "Sets the odd pixel width of the area searched for similar patches; defaults to 21." },
            { name: "saturation-recovery", kind: "literal", required: false,
              summary: "Sets how much saturation is restored after denoising dulls it; defaults to 1.02." },
          ] },
        { tag: "Color", cardinality: "many",
          summary: "Adjusts exposure, contrast, saturation, temperature, tint and gamma.",
          attributes: [
            { name: "exposure-stops", kind: "literal", required: false,
              summary: "Shifts overall brightness in photographic stops; defaults to 0." },
            { name: "contrast", kind: "literal", required: false,
              summary: "Scales the distance of each pixel from mid grey; defaults to 1." },
            { name: "saturation", kind: "literal", required: false,
              summary: "Scales color intensity, where 0 is greyscale; defaults to 1." },
            { name: "temperature", kind: "literal", required: false,
              summary: "Shifts the image between blue and amber; defaults to 0." },
            { name: "tint", kind: "literal", required: false,
              summary: "Shifts the image between green and magenta; defaults to 0." },
            { name: "gamma", kind: "literal", required: false,
              summary: "Bends the tone curve between shadows and highlights; defaults to 1." },
          ] },
        { tag: "Sharpen", cardinality: "many",
          summary: "Sharpens edges by an amount over a radius, above a threshold.",
          attributes: [
            { name: "amount", kind: "literal", required: false,
              summary: "Sets how strongly edge contrast is raised; defaults to 0.5." },
            { name: "radius", kind: "literal", required: false,
              summary: "Sets how far either side of an edge the sharpening reaches; defaults to 1." },
            { name: "threshold", kind: "literal", required: false,
              summary: "Sets the edge contrast below which pixels are left alone; defaults to 0." },
          ] },
        { tag: "Blur", cardinality: "many",
          summary: "Blurs the image by one sigma.",
          attributes: [
            { name: "sigma", kind: "literal", required: true,
              summary: "Sets the radius of the Gaussian blur." },
          ] },
        { tag: "Alpha", cardinality: "many",
          summary: "Keeps the alpha channel or flattens it onto a background color.",
          attributes: [
            { name: "mode", kind: "literal", required: false, values: ["preserve", "flatten"],
              summary: "Decides whether transparency survives or is painted over; defaults to `preserve`." },
            { name: "background", kind: "literal", required: false,
              summary: "Sets the hexadecimal color transparency is flattened onto." },
          ] },
        { tag: "Encode", cardinality: "optional",
          summary: "Encodes the result as PNG, JPEG or WebP.",
          attributes: [
            { name: "format", kind: "literal", required: false, values: ["png", "jpeg", "webp"],
              summary: "Chooses the container the result is written as; defaults to `png`." },
            { name: "quality", kind: "literal", required: false,
              summary: "Sets the lossy encoding quality from 1 to 100." },
            { name: "background", kind: "literal", required: false,
              summary: "Sets the hexadecimal color an opaque format is written over." },
          ] },
      ],
      example: [
        '<image:Program id="clean-gpt-image">',
        "  <image:Denoise/>",
        '  <image:Encode format="png"/>',
        "</image:Program>",
      ].join("\n"),
      notes: [
        "Operation order is author meaning: the operations run in the order they are written, and a Program requires at least one.",
        "In `fraction` a `Crop` measures 0 to 1 and must stay inside the source image; in `pixel` its origin and size are whole pixels.",
        "A `Denoise` needs odd windows, with `search-window` wider than `template-window`, and runs on its defaults alone.",
        "`Alpha` requires `background` when `mode` is `flatten` and refuses it when `mode` is `preserve`.",
        "`Encode` may appear only once and must be written last; `quality` is refused by `png`, and `background` is accepted only by `jpeg`.",
        "The ImageTransformProgram Record is published under the bare `id`, and the element carries no text content.",
      ],
    },
  }, {
    name: "transform",
    tag: "Transform",
    mode: "structured",
    outputs: [artifactTypes.blob],
    vocabulary: {
      summary: "Runs one ImageTransformProgram over a source image Artifact and publishes the transformed image.",
      attributes: [
        { name: "id", kind: "identifier", required: true,
          summary: "Names this transform so its image can be referenced elsewhere in the Source." },
        { name: "source", kind: "reference", required: true, accepts: [artifactTypes.blob],
          summary: "Chooses the image the operations are applied to." },
        { name: "program", kind: "reference", required: true, accepts: [imageTransformTypes.program],
          summary: "Chooses the ImageTransformProgram whose operations run over the source." },
      ],
      ports: [
        { name: "image", type: artifactTypes.blob,
          summary: "The transformed image, addressed as `<id>.image`." },
      ],
      example: `<image:Transform id="clean-shot" source={shot.image} program={clean-gpt-image}/>`,
      notes: [
        "The element is empty; it accepts no children and no text.",
        "The published image is the transformed image itself, carrying no source digest, Provider name or copied upstream metadata.",
        "A Program on its own produces no image; naming it here is what runs it.",
      ],
    },
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
