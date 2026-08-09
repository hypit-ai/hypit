import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import type { FragmentOperation } from "@narratage/elaborator";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { spatialTypes } from "@narratage/spatial";
import { screenOverlayProducers, screenOverlayTypes } from "./manifest.js";

export type ScreenOverlayFragmentItem =
  | { readonly kind: "program"; readonly specName: string }
  | { readonly kind: "selection"; readonly specName: string; readonly mapName: string; readonly sourceName: string }
  | { readonly kind: "moment"; readonly specName: string; readonly mapName: string; readonly sourceName: string };
const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });
export function createScreenOverlayFragment(items: readonly ScreenOverlayFragmentItem[], name: string) {
  if (items.length === 0) throw new Error("Screen Overlay Fragment requires at least one Item.");
  const types = new Map<string, typeof screenOverlayTypes.itemSpec | typeof semanticMapTypes.complete | typeof narrativeTypes.selection | typeof narrativeTypes.moment>();
  const operations: FragmentOperation[] = [{ id: "overlay:set:empty", producer: screenOverlayProducers.createSet, inputs: {}, result: { kind: "output", name: "set" } }];
  let current = "overlay:set:empty";
  items.forEach((item, index) => {
    types.set(item.specName, screenOverlayTypes.itemSpec);
    if (item.kind !== "program") {
      types.set(item.mapName, semanticMapTypes.complete);
      types.set(item.sourceName, item.kind === "selection" ? narrativeTypes.selection : narrativeTypes.moment);
    }
    const id = `overlay:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({ id, producer: item.kind === "program" ? screenOverlayProducers.appendProgram : item.kind === "selection" ? screenOverlayProducers.appendSelection : screenOverlayProducers.appendMoment,
      inputs: { set: operation(current), header: input("header"), space: input("space"), spec: input(item.specName),
        ...(item.kind === "program" ? {} : { map: input(item.mapName), [item.kind]: input(item.sourceName) }) }, result: { kind: "output", name: "set" } });
    current = id;
  });
  operations.push(
    { id: "overlay:program", producer: screenOverlayProducers.finalize, inputs: { set: operation(current), header: input("header") }, result: { kind: "output", name: "program" } },
    { id: "overlay:track", producer: screenOverlayProducers.render, inputs: { canvas: input("canvas"), space: input("space"), program: operation("overlay:program") }, result: { kind: "output", name: "track" } },
  );
  const semanticInputs = ["canvas", "header", "space", ...types.keys()];
  return sealGraphFragment({ name, inputs: [
    { name: "canvas", type: spatialTypes.canvas }, { name: "header", type: screenOverlayTypes.header },
    { name: "space", type: programSpaceTypes.programSpace }, ...[...types].map(([inputName, type]) => ({ name: inputName, type })),
  ], operations, exports: [
    { name: "program", type: screenOverlayTypes.program, root: operation("overlay:program"), semanticInputs, fidelity: "exact" },
    { name: "track", type: compositionTypes.visualTrack, root: operation("overlay:track"), semanticInputs, fidelity: "exact" },
  ] });
}
export const programScreenOverlayFragment = createScreenOverlayFragment([{ kind: "program", specName: "spec" }], "@narratage/screen-overlay/one-program-item@1");
