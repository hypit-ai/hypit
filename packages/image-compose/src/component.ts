import { plannedNeedInputs } from "@hypit/component-kit";
import type { ComponentPackage, ProducerHandlerContext } from "@hypit/component-kit";
import type { BlobRef, CanonicalValue, StoredValue } from "@hypit/protocol";
import { canonicalize } from "@hypit/protocol";
import { rasterComposeRequest } from "@hypit/raster";
import { rasterCapabilities } from "@hypit/raster";
import type { CanvasSpace, SpatialFrame } from "@hypit/spatial";

import { imageComposeProducers, imageComposeTypes } from "./manifest.js";
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
  producers: [{
    producer: imageComposeProducers.createLayers,
    handler: () => ({ outputs: { layers: output(createImageComposeLayerSet()) }, needs: {} }),
  }, {
    producer: imageComposeProducers.appendLayer,
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
    handler: ({ inputs }: ProducerHandlerContext) => {
      const canvas = inline<CanvasSpace>(inputs.canvas?.value, "CanvasSpace");
      const options = inline<ImageComposeOptions>(inputs.options?.value, "ImageComposeOptions");
      const set = inline<ImageComposeLayerSet>(inputs.layers?.value, "ImageComposeLayerSet");
      return { outputs: {}, needs: { image: rasterComposeRequest({
        canvas, background: options.background,
        layers: set.layers.map((layer) => ({
          source: layer.source, frame: layer.frame, fit: layer.spec.fit,
          interpolation: layer.spec.interpolation, opacity: layer.spec.opacity,
        })),
      }) } };
    },
  }],
  validators: [{
    type: imageComposeTypes.options,
    handler: ({ value }) => assertImageComposeOptions(inline<ImageComposeOptions>(value, "ImageComposeOptions")),
  }, {
    type: imageComposeTypes.layerSpec,
    handler: ({ value }) => assertImageComposeLayerSpec(inline<ImageComposeLayerSpec>(value, "ImageComposeLayerSpec")),
  }, {
    type: imageComposeTypes.layerSet,
    handler: ({ value }) => assertImageComposeLayerSet(inline<ImageComposeLayerSet>(value, "ImageComposeLayerSet")),
  }],
  plannedNeeds: [{
    producer: imageComposeProducers.request,
    port: "image",
    capability: rasterCapabilities.execute,
    plan({ state, step }) {
      const operation = state.plan.steps.find((item) => item.id === step);
      if (operation === undefined) return undefined;
      const read = (input: string) => {
        const record = operation.inputs[input];
        const value = record === undefined ? undefined : state.records.find((item) => item.id === record)?.value;
        return value?.kind === "inline" ? value.value : undefined;
      };
      const canvas = read("canvas");
      const options = read("options");
      if (canvas === undefined || options === undefined) return undefined;
      return {
        constraints: { kind: "compose", canvas, options },
        pendingInputs: plannedNeedInputs(state, step),
      };
    },
    present(specification) {
      const constraints = specification.constraints as Readonly<Record<string, CanonicalValue>>;
      const canvas = constraints.canvas as Readonly<Record<string, CanonicalValue>> | undefined;
      return {
        fields: typeof canvas?.widthPx === "number" && typeof canvas.heightPx === "number"
          ? { canvas: [`${canvas.widthPx}×${canvas.heightPx}`] }
          : {},
        references: {},
      };
    },
  }],
} satisfies ComponentPackage;
