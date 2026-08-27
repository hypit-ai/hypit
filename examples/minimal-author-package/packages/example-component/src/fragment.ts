import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import { programSpaceTypes } from "@hypit/program-space";
import { exampleProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createExampleFragment(producer: typeof exampleProducers[keyof typeof exampleProducers], id: string) {
  return sealGraphFragment({
    inputs: [{ name: "space", type: programSpaceTypes.programSpace }],
    operations: [{
      id,
      producer,
      inputs: { space: input("space") },
      result: { kind: "output", name: "track" },
    }],
    exports: [{ name: "track", type: compositionTypes.visualTrack, root: operation(id) }],
  });
}

export const exampleBoxFragment = createExampleFragment(exampleProducers.renderBox, "render-box");
export const exampleTextFragment = createExampleFragment(exampleProducers.renderText, "render-text");
export const exampleMediaFragment = createExampleFragment(exampleProducers.renderMedia, "render-media-slot");
