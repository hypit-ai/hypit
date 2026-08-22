import { compositionTypes } from "@hypit/composition";
import { sealGraphFragment } from "@hypit/elaborator";
import type { FragmentOperation } from "@hypit/elaborator";
import { narrativeTypes } from "@hypit/narrative";
import { semanticTrackTypes } from "@hypit/semantic-track";
import { spatialTypes } from "@hypit/spatial";
import { temporalProducers, temporalTypes } from "@hypit/temporal";
import { screenOverlayProducers, screenOverlayTypes } from "./manifest.js";

export type ScreenOverlayFragmentItem =
  | { readonly kind: "program"; readonly specName: string; readonly windowSpecName: string }
  | { readonly kind: "selection"; readonly specName: string; readonly sourceName: string; readonly windowSpecName: string }
  | { readonly kind: "moment"; readonly specName: string; readonly sourceName: string; readonly windowSpecName: string };
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
export function createScreenOverlayFragment(items: readonly ScreenOverlayFragmentItem[]) {
  if (items.length === 0) throw new Error("Screen Overlay Fragment requires at least one Item.");
  const types = new Map<string, typeof screenOverlayTypes.itemSpec | typeof semanticTrackTypes.track | typeof narrativeTypes.selection | typeof narrativeTypes.moment | typeof temporalTypes.windowSpec>();
  const operations: FragmentOperation[] = [{ id: "overlay:set:empty", producer: screenOverlayProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } }];
  let current = "overlay:set:empty";
  items.forEach((item, index) => {
    types.set(item.specName, screenOverlayTypes.itemSpec);
    types.set(item.windowSpecName, temporalTypes.windowSpec);
    if (item.kind !== "program") {
      types.set(item.sourceName, item.kind === "selection" ? narrativeTypes.selection : narrativeTypes.moment);
    }
    const id = `overlay:set:append:${String(index + 1).padStart(4, "0")}`;
    const windowId = `overlay:window:${String(index + 1).padStart(4, "0")}`;
    const windowProducer = item.kind === "program" ? temporalProducers.projectProgram
      : item.kind === "selection" ? temporalProducers.projectSelection : temporalProducers.projectMoment;
    operations.push({ id: windowId, producer: windowProducer, inputs: {
      semantic: input("semantic"), spec: input(item.windowSpecName),
      ...(item.kind === "program" ? {} : { [item.kind]: input(item.sourceName) }),
    }, result: { kind: "output", name: "window" } });
    operations.push({ id, producer: screenOverlayProducers.appendItem,
      inputs: { set: operation(current), header: input("header"), semantic: input("semantic"), spec: input(item.specName),
        window: operation(windowId) }, result: { kind: "output", name: "set" } });
    current = id;
  });
  operations.push(
    { id: "overlay:program", producer: screenOverlayProducers.finalize, inputs: { set: operation(current), header: input("header") }, result: { kind: "output", name: "program" } },
    { id: "overlay:track", producer: screenOverlayProducers.render, inputs: { canvas: input("canvas"), semantic: input("semantic"), program: operation("overlay:program") }, result: { kind: "output", name: "track" } },
  );
  return sealGraphFragment({ inputs: [
    { name: "canvas", type: spatialTypes.canvas }, { name: "header", type: screenOverlayTypes.header },
    { name: "semantic", type: semanticTrackTypes.track }, ...[...types].map(([inputName, type]) => ({ name: inputName, type })),
  ], operations, exports: [
    { name: "program", type: screenOverlayTypes.program, root: operation("overlay:program") },
    { name: "track", type: compositionTypes.visualTrack, root: operation("overlay:track") },
  ] });
}
export const programScreenOverlayFragment = createScreenOverlayFragment([{ kind: "program", specName: "spec", windowSpecName: "window-spec" }]);
