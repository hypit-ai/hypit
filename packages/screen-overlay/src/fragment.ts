import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { semanticTrackProducers, semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { screenOverlayProducers, screenOverlayTypes } from "./manifest.js";

export type ScreenOverlayFragmentItem = { readonly specName: string; readonly windowName: string };
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
export function createScreenOverlayFragment(items: readonly ScreenOverlayFragmentItem[]) {
  if (items.length === 0) throw new Error("Screen Overlay Fragment requires at least one Item.");
  const types = new Map<string, typeof screenOverlayTypes.itemSpec | typeof temporalTypes.window>();
  const operations: FragmentOperation[] = [
    { id: "overlay:space", producer: semanticTrackProducers.projectProgramSpace, inputs: { track: input("semantic") }, result: { kind: "output", name: "space" } },
    { id: "overlay:set:empty", producer: screenOverlayProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } },
  ];
  let current = "overlay:set:empty";
  items.forEach((item, index) => {
    types.set(item.specName, screenOverlayTypes.itemSpec);
    types.set(item.windowName, temporalTypes.window);
    const id = `overlay:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({ id, producer: screenOverlayProducers.appendItem,
      inputs: { set: operation(current), header: input("header"), spec: input(item.specName),
        space: operation("overlay:space"), window: input(item.windowName) }, result: { kind: "output", name: "set" } });
    current = id;
  });
  operations.push(
    { id: "overlay:program", producer: screenOverlayProducers.finalize, inputs: { set: operation(current), header: input("header") }, result: { kind: "output", name: "program" } },
    { id: "overlay:track", producer: screenOverlayProducers.render, inputs: { canvas: input("canvas"), space: operation("overlay:space"), program: operation("overlay:program") }, result: { kind: "output", name: "track" } },
  );
  return sealGraphFragment({ inputs: [
    { name: "canvas", type: spatialTypes.canvas }, { name: "header", type: screenOverlayTypes.header },
    { name: "semantic", type: semanticTrackTypes.track }, ...[...types].map(([inputName, type]) => ({ name: inputName, type })),
  ], operations, exports: [
    { name: "program", type: screenOverlayTypes.program, root: operation("overlay:program") },
    { name: "track", type: compositionTypes.visualTrack, root: operation("overlay:track") },
  ] });
}
export const programScreenOverlayFragment = createScreenOverlayFragment([{ specName: "spec", windowName: "window" }]);
