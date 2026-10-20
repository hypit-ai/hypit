import { compositionTypes } from "@hypit/composition";
import { blobTypes } from "@hypit/hypit/blob";
import { sealGraphFragment } from "@hypit/hypit/author";
import { timelineTypes } from "@hypit/timeline";
import { spatialTypes } from "@hypit/spatial";
import { exampleProducers } from "./manifest.js";
import { exampleTypes } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createExampleFragment(producer: typeof exampleProducers[keyof typeof exampleProducers], id: string, image = false) {
  const inputs = [{ name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
    ...(image ? [{ name: "image", type: blobTypes.blob }] : [])];
  const renderInputs = { timeline: input("timeline"), within: input("within"), ...(image ? { image: input("image") } : {}) };
  return sealGraphFragment({
    inputs,
    operations: [
      { id, producer, inputs: renderInputs, result: { kind: "output" as const, name: "visual" } },
    ],
    exports: [{ name: "visual", type: compositionTypes.visualTrack, root: operation(id) }],
  });
}

export const exampleBoxFragment = createExampleFragment(exampleProducers.renderBox, "render-box");
export const exampleTextFragment = createExampleFragment(exampleProducers.renderText, "render-text");
export const exampleImageFragment = createExampleFragment(exampleProducers.renderImage, "render-image-slot", true);
export const exampleAppendFragment = sealGraphFragment({
  inputs: [{ name: "previous", type: exampleTypes.itemSet }, { name: "item", type: exampleTypes.itemSet }],
  operations: [{ id: "append-items", producer: exampleProducers.appendItems, inputs: { previous: input("previous"), item: input("item") }, result: { kind: "output" as const, name: "set" } }],
  exports: [{ name: "set", type: exampleTypes.itemSet, root: operation("append-items") }],
});
