import { artifactTypes } from "@svml/artifact";
import { contractTypes } from "@svml/contracts";
import { sealGraphFragment } from "@svml/elaborator";
import type { FragmentOperation } from "@svml/elaborator";
import {
  mediaPipelineTypes,
  sealMediaSelectionRequest,
  synchronizedMediaFragment,
} from "@svml/media-pipeline";
import { svsRecipeType } from "@svml/svs";
import type { SvsRecipe } from "@svml/svs";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, TextAttributeValue } from "@svml/text";

import { sealBrollItemSpec, sealBrollTrackSpec } from "./author.js";
import { brollProducers, brollTypes } from "./manifest.js";
import type { BrollMotion, BrollSurfaceItemInput } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

function createBrollSurfaceFragment(items: readonly BrollSurfaceItemInput[], name: string) {
  const operations: FragmentOperation[] = [
    { id: "broll:space", producer: brollProducers.projectSpace, inputs: { map: input("map") }, result: { kind: "output", name: "space" } },
    { id: "broll:set:empty", producer: brollProducers.createSet, inputs: { map: input("map"), spec: input("track-spec") }, result: { kind: "output", name: "set" } },
  ];
  let current = "broll:set:empty";
  items.forEach((item, index) => {
    const id = `broll:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push({
      id, producer: brollProducers.appendItem,
      inputs: { set: operation(current), media: input(item.mediaName), selection: input(item.selectionName), spec: input(item.specName) },
      result: { kind: "output", name: "set" },
    });
    current = id;
  });
  operations.push(
    { id: "broll:program", producer: brollProducers.finalize, inputs: { set: operation(current) }, result: { kind: "output", name: "program" } },
    { id: "broll:product", producer: brollProducers.compile, inputs: { space: operation("broll:space"), program: operation("broll:program") }, result: { kind: "output", name: "product" } },
    { id: "broll:visual", producer: brollProducers.projectVisual, inputs: { product: operation("broll:product") }, result: { kind: "output", name: "visual" } },
    { id: "broll:audio", producer: brollProducers.projectAudio, inputs: { product: operation("broll:product") }, result: { kind: "output", name: "audio" } },
  );
  const semanticInputs = ["map", "track-spec", ...items.flatMap((item) => [item.mediaName, item.selectionName, item.specName])];
  return sealGraphFragment({
    name,
    inputs: [
      { name: "map", type: contractTypes.completeSemanticMap },
      { name: "track-spec", type: brollTypes.trackSpec },
      ...items.flatMap((item) => [
        { name: item.mediaName, type: contractTypes.synchronizedMedia },
        { name: item.selectionName, type: contractTypes.narrativeSelection },
        { name: item.specName, type: brollTypes.itemSpec },
      ]),
    ],
    operations,
    exports: [
      { name: "visual", type: contractTypes.visualTrack, root: operation("broll:visual"), semanticInputs,
        affinity: [{ resultPointer: "/programSpaceDigest", source: input("map"), sourcePointer: "/programSpace/digest" }], fidelity: "exact" },
      { name: "audio", type: contractTypes.audioTrack, root: operation("broll:audio"), semanticInputs,
        affinity: [{ resultPointer: "/programSpaceDigest", source: input("map"), sourcePointer: "/programSpace/digest" }], fidelity: "exact" },
    ],
  });
}

function sameType(left: SurfaceResolvedReference["type"], right: SurfaceResolvedReference["type"]): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
}
function exact(element: StructuredElement, names: readonly string[]): void {
  if (Object.keys(element.attributes).sort().join("\0") !== [...names].sort().join("\0")) throw new Error(`${element.name} requires exactly ${names.join(", ")}`);
}
function text(element: StructuredElement, name: string): string {
  const value = element.attributes[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be a non-empty string`);
  return value.trim();
}
function ref(element: StructuredElement, name: string, expected: SurfaceResolvedReference["type"], resolve: (path: string) => SurfaceResolvedReference | undefined) {
  const raw: TextAttributeValue | undefined = element.attributes[name];
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference`);
  const value = resolve(raw.path);
  if (!value || !sameType(value.type, expected)) throw new Error(`${element.name}.${name} cannot resolve a value of the required type`);
  return value;
}
function recipe(value: SurfaceResolvedReference): SvsRecipe {
  if (!sameType(value.type, svsRecipeType) || value.record?.value.kind !== "inline") throw new Error("B-roll appearance must be an authored SVS Recipe");
  return value.record.value.value as unknown as SvsRecipe;
}
function num(value: SvsRecipe, name: string): number {
  const result = value.properties[name];
  if (typeof result !== "number" || !Number.isFinite(result)) throw new Error(`B-roll Recipe ${name} must be a number`);
  return result;
}
function str(value: SvsRecipe, name: string): string {
  const result = value.properties[name];
  if (typeof result !== "string" || !result) throw new Error(`B-roll Recipe ${name} must be a string`);
  return result;
}
function motion(value: string): BrollMotion {
  const match = /^(fade|pop|slide-up|slide-down)\s+([1-9][0-9]*)f$/u.exec(value.trim());
  if (!match) throw new Error(`B-roll motion ${value} is invalid`);
  return { operator: match[1] as BrollMotion["operator"], durationFrames: Number(match[2]) };
}

export const decodeBrollTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  exact(element, ["id", "map"]);
  const id = text(element, "id");
  const map = ref(element, "map", contractTypes.completeSemanticMap, resolveReference);
  const trackSpecId = `${id}.spec`;
  const requestId = `${id}.selection`;
  const records: Array<{ id: string; type: typeof brollTypes.itemSpec | typeof brollTypes.trackSpec | typeof mediaPipelineTypes.selectionRequest; value: { kind: "inline"; value: ReturnType<typeof sealBrollItemSpec> | ReturnType<typeof sealBrollTrackSpec> | ReturnType<typeof sealMediaSelectionRequest> }; range: typeof element.range }> = [
    { id: trackSpecId, type: brollTypes.trackSpec, value: { kind: "inline", value: sealBrollTrackSpec({ contract: "svml.broll-track-spec@1", id }) }, range: element.range },
    { id: requestId, type: mediaPipelineTypes.selectionRequest, value: { kind: "inline", value: sealMediaSelectionRequest({
      contract: "svml.media-selection-request@1", video: { mode: "primary-moving" }, audio: { mode: "none" },
      spanAuthority: "video", frameRate: { numerator: 30, denominator: 1 },
    }) }, range: element.range },
  ];
  let itemIndex = 0;
  const declared = element.children.flatMap((child) => {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Item children`);
      return [];
    }
    if (!child.name.endsWith(":Item") && child.name !== "Item") throw new Error(`${element.name} accepts only Item children`);
    itemIndex += 1;
    exact(child, ["source", "during", "appearance"]);
    const source = ref(child, "source", artifactTypes.blob, resolveReference);
    const selection = ref(child, "during", contractTypes.narrativeSelection, resolveReference);
    const appearance = recipe(ref(child, "appearance", svsRecipeType, resolveReference));
    const expected = ["background", "enter", "exit", "fit", "height", "radius", "stack-order", "width", "x", "y"];
    if (Object.keys(appearance.properties).sort().join("\0") !== expected.sort().join("\0")) throw new Error(`B-roll Recipe requires exactly ${expected.join(", ")}`);
    const fit = str(appearance, "fit");
    if (fit !== "contain" && fit !== "cover") throw new Error("B-roll Recipe fit is invalid");
    const suffix = String(itemIndex).padStart(4, "0");
    const specId = `${id}.item.${suffix}.spec`;
    records.push({
      id: specId, type: brollTypes.itemSpec,
      value: { kind: "inline", value: sealBrollItemSpec({
        contract: "svml.broll-item-spec@1", id: `${id}.item.${suffix}`, z: num(appearance, "stack-order"),
        box: { xPercent: num(appearance, "x") * 100, yPercent: num(appearance, "y") * 100,
          widthPercent: num(appearance, "width") * 100, heightPercent: num(appearance, "height") * 100 },
        fit, backgroundColor: str(appearance, "background"), borderRadiusPx: num(appearance, "radius"),
        enter: motion(str(appearance, "enter")), exit: motion(str(appearance, "exit")),
      }) }, range: child.range,
    });
    return [{ suffix, source, selection, specId, range: child.range,
      input: { mediaName: `item-${suffix}-media`, selectionName: `item-${suffix}-selection`, specName: `item-${suffix}-spec` } }];
  });
  if (declared.length === 0) throw new Error(`${element.name} requires at least one Item`);
  const fragment = createBrollSurfaceFragment(declared.map((item) => item.input), `@svml/broll/surface/${id}@1`);
  const normalization = declared.map((item) => ({
    id: `${id}.normalize.${item.suffix}`, fragment: synchronizedMediaFragment.id,
    inputs: { source: item.source.ref, request: { kind: "record" as const, id: requestId } },
    outputs: { media: `${id}.normalized.${item.suffix}` }, range: item.range,
  }));
  return {
    records,
    components: [
      ...normalization,
      { id, fragment: fragment.id, inputs: {
        map: map.ref, "track-spec": { kind: "record", id: trackSpecId },
        ...Object.fromEntries(declared.flatMap((item, index) => [
          [item.input.mediaName, { kind: "component-output" as const, component: normalization[index]!.id, output: "media" }],
          [item.input.selectionName, item.selection.ref],
          [item.input.specName, { kind: "record" as const, id: item.specId }],
        ])),
      }, outputs: { visual: `${id}.visual`, audio: `${id}.audio` }, range: element.range },
    ],
    fragments: [synchronizedMediaFragment, fragment],
  };
};
