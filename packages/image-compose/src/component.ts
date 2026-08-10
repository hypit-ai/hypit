import type { ComponentPackage, ProducerHandlerContext } from "@narratage/component-kit";
import type { BlobRef, StoredValue } from "@narratage/protocol";
import { canonicalize } from "@narratage/protocol";
import { rasterComposeRequest } from "@narratage/raster";
import type { CanvasSpace, SpatialFrame } from "@narratage/spatial";

import { imageComposeImplementationDigests, imageComposeProducers, imageComposeTypes } from "./manifest.js";
import {
  appendImageComposeLayer,
  assertImageComposeLayerSet,
  assertImageComposeLayerSpec,
  assertImageComposeOptions,
  createImageComposeLayerSet,
} from "./program.js";
import type { ImageComposeLayerSet, ImageComposeLayerSpec, ImageComposeOptions } from "./types.js";

function inline<T>(value: StoredValue | undefined, label: string): T {
  if (value?.kind !== "inline") throw new Error(`${label} must be inline.`);
  return value.value as unknown as T;
}
function blob(value: StoredValue | undefined, label: string): BlobRef {
  if (value?.kind !== "blob") throw new Error(`${label} must be a Blob Artifact.`);
  return value;
}
const output = (value: unknown) => ({ kind: "inline" as const, value: canonicalize(value) });

export const imageComposeComponent = {
  name: "@narratage/image-compose",
  producers: [{
    producer: imageComposeProducers.createLayers,
    implementationDigest: imageComposeImplementationDigests.createLayers,
    handler: () => ({ outputs: { layers: output(createImageComposeLayerSet()) }, needs: {} }),
  }, {
    producer: imageComposeProducers.appendLayer,
    implementationDigest: imageComposeImplementationDigests.appendLayer,
    handler: ({ inputs }: ProducerHandlerContext) => ({
      outputs: { layers: output(appendImageComposeLayer(
        inline<ImageComposeLayerSet>(inputs.layers?.value, "ImageComposeLayerSet"),
        blob(inputs.source?.value, "Image Compose source"),
        inline<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
        inline<ImageComposeLayerSpec>(inputs.spec?.value, "ImageComposeLayerSpec"),
      )) },
      needs: {},
    }),
  }, {
    producer: imageComposeProducers.request,
    implementationDigest: imageComposeImplementationDigests.request,
    handler: ({ inputs }: ProducerHandlerContext) => {
      const canvas = inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace");
      const options = inline<ImageComposeOptions>(inputs.options?.value, "ImageComposeOptions");
      const set = inline<ImageComposeLayerSet>(inputs.layers?.value, "ImageComposeLayerSet");
      return { outputs: {}, needs: { image: { constraints: rasterComposeRequest({
        canvas, background: options.background,
        layers: set.layers.map((layer) => ({
          source: layer.source, frame: layer.frame, fit: layer.spec.fit,
          interpolation: layer.spec.interpolation, opacity: layer.spec.opacity,
        })),
      }) as never } } };
    },
  }],
  validators: [{
    type: imageComposeTypes.options,
    implementationDigest: imageComposeImplementationDigests.validateOptions,
    handler: ({ value }) => assertImageComposeOptions(inline<ImageComposeOptions>(value, "ImageComposeOptions")),
  }, {
    type: imageComposeTypes.layerSpec,
    implementationDigest: imageComposeImplementationDigests.validateLayerSpec,
    handler: ({ value }) => assertImageComposeLayerSpec(inline<ImageComposeLayerSpec>(value, "ImageComposeLayerSpec")),
  }, {
    type: imageComposeTypes.layerSet,
    implementationDigest: imageComposeImplementationDigests.validateLayerSet,
    handler: ({ value }) => assertImageComposeLayerSet(inline<ImageComposeLayerSet>(value, "ImageComposeLayerSet")),
  }],
} satisfies ComponentPackage;
