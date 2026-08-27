import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import { semanticTrackProducers, semanticTrackTypes } from "@hypit/semantic-track";
import { programSpaceTypes } from "@hypit/program-space";
import { exampleProducers } from "./manifest.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

export function createExampleFragment(producer: typeof exampleProducers[keyof typeof exampleProducers], id: string) {
  return sealGraphFragment({
    inputs: [{ name: "semantic", type: semanticTrackTypes.track }],
    operations: [
      { id: "space", producer: semanticTrackProducers.projectProgramSpace, inputs: { track: input("semantic") }, result: { kind: "output", name: "space" } },
      { id, producer, inputs: { space: operation("space") }, result: { kind: "output", name: "track" } },
    ],
    exports: [{ name: "track", type: compositionTypes.visualTrack, root: operation(id) }],
  });
}

export const exampleBoxFragment = createExampleFragment(exampleProducers.renderBox, "render-box");
export const exampleTextFragment = createExampleFragment(exampleProducers.renderText, "render-text");
export const exampleMediaFragment = createExampleFragment(exampleProducers.renderMedia, "render-media-slot");
