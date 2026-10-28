import { compositionTypes } from "@hypit/composition";
import type { ModuleManifest, ProducerRef, TypeRef } from "@hypit/hypit/protocol";
import { timelineTypes } from "@hypit/timeline";
import { temporalTypes } from "@hypit/temporal";
import { mediaTypes } from "@hypit/media";
import { recipeType } from "@hypit/hypit/recipe";
import { blobTypes } from "@hypit/hypit/blob";
import { spatialTypes } from "@hypit/spatial";

export const exampleModuleRef = { name: "@example/example-component", version: "1" } as const;
export const exampleTypes = {
  box: { module: exampleModuleRef, name: "ExampleBox" },
  text: { module: exampleModuleRef, name: "ExampleText" },
  imageSlot: { module: exampleModuleRef, name: "ExampleImageSlot" },
  style: { module: exampleModuleRef, name: "ExampleStyle" },
  itemSet: { module: exampleModuleRef, name: "ExampleItemSet" },
} satisfies Record<string, TypeRef>;
export const exampleProducers = {
  renderBox: { module: exampleModuleRef, name: "render-example-box" },
  renderText: { module: exampleModuleRef, name: "render-example-text" },
  renderImage: { module: exampleModuleRef, name: "render-example-image-slot" },
  appendItems: { module: exampleModuleRef, name: "append-example-items" },
} satisfies Record<string, ProducerRef>;

export const exampleManifest: ModuleManifest = {
  format: "hypit.module@1", name: exampleModuleRef.name, version: exampleModuleRef.version,
  dependencies: [
    blobTypes.blob.module,
    compositionTypes.visualTrack.module,
    mediaTypes.fontStack.module,
    spatialTypes.frame.module,
    timelineTypes.timeline.module,
    recipeType.module,
    temporalTypes.window.module,
  ],
  types: Object.values(exampleTypes).map(({ name }) => name),
  capabilities: [],
  producers: Object.values(exampleProducers).map((producer) => ({
    name: producer.name,
    inputs: producer === exampleProducers.appendItems
      ? [{ name: "previous", type: exampleTypes.itemSet }, { name: "item", type: exampleTypes.itemSet }]
      : [{ name: "timeline", type: timelineTypes.timeline }, { name: "within", type: spatialTypes.frame },
        ...(producer === exampleProducers.renderImage ? [{ name: "image", type: blobTypes.blob }] : [])],
    result: producer === exampleProducers.appendItems
      ? { kind: "output", name: "set", type: exampleTypes.itemSet }
      : { kind: "output", name: "visual", type: compositionTypes.visualTrack },
  })),
};
