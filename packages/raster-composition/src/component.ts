import { assertBlobRef, canonicalize } from "@hypit/hypit/value";
import type { ProducerPackage } from "@hypit/hypit/generation/producer";
import type { RefinementPackage } from "@hypit/hypit/generation/refinement";
import type { Value } from "@hypit/hypit/value";
import { rasterCompositionProducers, rasterCompositionTypes } from "./manifest.js";
import {
  appendRasterCompositionLayer,
  assertRasterComposition,
  assertRasterCompositionOptions,
  assertRasterLayerPlacement,
  createRasterComposition,
  rasterCompositionRequest,
} from "./operations.js";
import type { RasterComposition, RasterCompositionOptions, RasterLayerPlacement } from "./types.js";

function value<T>(input: Value | undefined, label: string): T {
  if (input === undefined) throw new Error(`${label} is missing.`);
  return input as unknown as T;
}

export const rasterCompositionComponent = {
  refinements: [{
    type: rasterCompositionTypes.options,
    handler: ({ value: input }) => assertRasterCompositionOptions(value(input, "RasterCompositionOptions")),
  }, {
    type: rasterCompositionTypes.placement,
    handler: ({ value: input }) => assertRasterLayerPlacement(value(input, "RasterLayerPlacement")),
  }, {
    type: rasterCompositionTypes.composition,
    handler: ({ value: input }) => assertRasterComposition(value(input, "RasterComposition")),
  }],
  producers: [{
    producer: rasterCompositionProducers.create,
    handler: ({ inputs }) => ({
      kind: "output",
      value: canonicalize(createRasterComposition(
        value<RasterCompositionOptions>(inputs.options?.value, "RasterCompositionOptions"),
      )),
    }),
  }, {
    producer: rasterCompositionProducers.append,
    handler: ({ inputs }) => {
      const source = inputs.source?.value;
      assertBlobRef(source, "Raster composition source");
      return {
        kind: "output",
        value: canonicalize(appendRasterCompositionLayer(
          value<RasterComposition>(inputs.composition?.value, "RasterComposition"),
          source,
          value<RasterLayerPlacement>(inputs.placement?.value, "RasterLayerPlacement"),
        )),
      };
    },
  }, {
    producer: rasterCompositionProducers.render,
    handler: ({ inputs }) => ({
      kind: "need",
      constraints: canonicalize(rasterCompositionRequest(
        value<RasterComposition>(inputs.composition?.value, "RasterComposition"),
      )),
    }),
  }],
} satisfies { producers: ProducerPackage; refinements: RefinementPackage };
