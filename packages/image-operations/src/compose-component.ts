import type { BlobRef, Value } from "@hypit/hypit/protocol";
import type { ProducerPackage, ProducerHandlerContext } from "@hypit/hypit/producer";
import type { RefinementPackage } from "@hypit/hypit/refinement";
import { assertBlobRef, canonicalize } from "@hypit/hypit/protocol";
import type { Canvas, SpatialFrame } from "@hypit/spatial";

import { imageComposeRequest } from "./execution.js";
import { imageComposeProducers, imageComposeTypes } from "./refs.js";
import {
  appendImageComposeLayer,
  assertImageComposeLayerSet,
  assertImageComposeLayerSpec,
  assertImageComposeOptions,
  createImageComposeLayerSet,
} from "./compose-program.js";
import type { ImageComposeLayerSet, ImageComposeLayerSpec, ImageComposeOptions } from "./compose-types.js";

function valueOf<T>(value: Value | undefined, label: string): T {
  if (value === undefined) throw new Error(`${label} is missing.`);
  return value as unknown as T;
}
function blob(value: Value | undefined, label: string): BlobRef {
  assertBlobRef(value, label);
  return value;
}
const output = (value: unknown) => ((canonicalize(value)));

export const imageComposeComponent = {
  producers: [{
    producer: imageComposeProducers.createLayers,
    handler: () => ({ kind: "output", value: output(createImageComposeLayerSet()) }),
  }, {
    producer: imageComposeProducers.appendLayer,
    handler: ({ inputs }: ProducerHandlerContext) => ({ kind: "output", value: output(appendImageComposeLayer(
        valueOf<ImageComposeLayerSet>(inputs.layers?.value, "ImageComposeLayerSet"),
        blob(inputs.source?.value, "Image Compose source"),
        valueOf<SpatialFrame>(inputs.frame?.value, "SpatialFrame"),
        valueOf<ImageComposeLayerSpec>(inputs.spec?.value, "ImageComposeLayerSpec"),
      )) }),
  }, {
    producer: imageComposeProducers.request,
    handler: ({ inputs }: ProducerHandlerContext) => {
      const canvas = valueOf<Canvas>(inputs.canvas?.value, "Canvas");
      const options = valueOf<ImageComposeOptions>(inputs.options?.value, "ImageComposeOptions");
      const set = valueOf<ImageComposeLayerSet>(inputs.layers?.value, "ImageComposeLayerSet");
      return { kind: "need", constraints: imageComposeRequest({
        canvas, background: options.background,
        layers: set.layers.map((layer) => ({
          source: layer.source, frame: layer.frame, fit: layer.spec.fit,
          interpolation: layer.spec.interpolation, opacity: layer.spec.opacity,
        })),
      }) };
    },
  }],
  refinements: [{
    type: imageComposeTypes.options,
    handler: ({ value }) => assertImageComposeOptions(valueOf<ImageComposeOptions>(value, "ImageComposeOptions")),
  }, {
    type: imageComposeTypes.layerSpec,
    handler: ({ value }) => assertImageComposeLayerSpec(valueOf<ImageComposeLayerSpec>(value, "ImageComposeLayerSpec")),
  }, {
    type: imageComposeTypes.layerSet,
    handler: ({ value }) => assertImageComposeLayerSet(valueOf<ImageComposeLayerSet>(value, "ImageComposeLayerSet")),
  }],
} satisfies { producers?: ProducerPackage; refinements?: RefinementPackage };
