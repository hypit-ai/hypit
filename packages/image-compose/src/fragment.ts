import { artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { spatialTypes } from "@hypit/spatial";

import { imageComposeProducers, imageComposeTypes } from "./manifest.js";

export type ImageComposeFragmentLayer = {
  readonly sourceName: string;
  readonly frameName: string;
  readonly specName: string;
};

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createImageComposeFragment(layers: readonly ImageComposeFragmentLayer[]) {
  if (layers.length === 0) throw new Error("Image Compose Fragment requires at least one Layer.");
  const operations: FragmentOperation[] = [{
    id: "image:layers:empty", producer: imageComposeProducers.createLayers, inputs: {},
    result: { kind: "output", name: "layers" },
  }];
  let previous = "image:layers:empty";
  layers.forEach((layer, index) => {
    const id = `image:layers:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id, producer: imageComposeProducers.appendLayer,
      inputs: {
        layers: operation(previous), source: input(layer.sourceName),
        frame: input(layer.frameName), spec: input(layer.specName),
      },
      result: { kind: "output", name: "layers" },
    });
    previous = id;
  });
  operations.push({
    id: "image:compose", producer: imageComposeProducers.request,
    inputs: { canvas: input("canvas"), options: input("options"), layers: operation(previous) },
    result: { kind: "need", name: "image" },
  });
  return sealGraphFragment({
    inputs: [
      { name: "canvas", type: spatialTypes.canvas },
      { name: "options", type: imageComposeTypes.options },
      ...layers.flatMap((layer) => [
        { name: layer.sourceName, type: artifactTypes.blob },
        { name: layer.frameName, type: spatialTypes.frame },
        { name: layer.specName, type: imageComposeTypes.layerSpec },
      ]),
    ],
    operations,
    exports: [{ name: "image", type: artifactTypes.blob, root: operation("image:compose") }],
  });
}
