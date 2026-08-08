import { narrativeTypes } from "@narratage/narrative";
import type { NarrativeSelection } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import { semanticMapTypes } from "@narratage/semantic-map";
import { compositionTypes } from "@narratage/composition";
import { sealGraphFragment } from "@narratage/elaborator";
import type { FragmentOperation } from "@narratage/elaborator";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceResolvedReference, TextAttributeValue } from "@narratage/text";

import { textTrackProducers, textTrackTypes } from "./manifest.js";
import { sealTextItemSpec, sealTextTrackHeader } from "./program.js";
import { textAppearanceFromRecipe } from "./recipe.js";
import type { TextItemSpec } from "./types.js";

const input = (name: string) => ({ kind: "fragment-input" as const, name });
const operation = (id: string) => ({ kind: "fragment-operation" as const, operation: id });

type SurfaceItem = {
  readonly suffix: string;
  readonly specName: string;
  readonly selectionName?: string;
};

function createTextTrackSurfaceFragment(id: string, items: readonly SurfaceItem[]) {
  const selected = items.filter((item) => item.selectionName !== undefined);
  const operations: FragmentOperation[] = [{
    id: "text:set:empty",
    producer: textTrackProducers.createSet,
    inputs: {},
    result: { kind: "output", name: "set" },
  }];
  let current = "text:set:empty";
  items.forEach((item, index) => {
    const operationId = `text:set:append:${String(index + 1).padStart(4, "0")}`;
    operations.push(item.selectionName === undefined ? {
      id: operationId,
      producer: textTrackProducers.appendFull,
      inputs: { set: operation(current), header: input("header"), space: input("space"), spec: input(item.specName) },
      result: { kind: "output", name: "set" },
    } : {
      id: operationId,
      producer: textTrackProducers.appendSelected,
      inputs: {
        set: operation(current),
        header: input("header"),
        map: input("map"),
        selection: input(item.selectionName),
        space: input("space"),
        spec: input(item.specName),
      },
      result: { kind: "output", name: "set" },
    });
    current = operationId;
  });
  operations.push(
    { id: "text:finalize", producer: textTrackProducers.finalize, inputs: { header: input("header"), set: operation(current) }, result: { kind: "output", name: "program" } },
    { id: "text:render", producer: textTrackProducers.render, inputs: { space: input("space"), program: operation("text:finalize") }, result: { kind: "output", name: "track" } },
  );
  const semanticInputs = ["space", "header", ...(selected.length === 0 ? [] : ["map"]),
    ...items.flatMap((item) => [item.specName, ...(item.selectionName === undefined ? [] : [item.selectionName])])];
  return sealGraphFragment({
    name: `@narratage/text-track/surface/${id}@2`,
    inputs: [
      { name: "space", type: programSpaceTypes.programSpace },
      { name: "header", type: textTrackTypes.header },
      ...(selected.length === 0 ? [] : [{ name: "map", type: semanticMapTypes.complete }]),
      ...items.flatMap((item) => [
        { name: item.specName, type: textTrackTypes.itemSpec },
        ...(item.selectionName === undefined ? [] : [{ name: item.selectionName, type: narrativeTypes.selection }]),
      ]),
    ],
    operations,
    exports: [{
      name: "track", type: compositionTypes.visualTrack, root: operation("text:render"), semanticInputs, fidelity: "exact",
    }],
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
  if (!sameType(value.type, svsRecipeType) || value.record?.value.kind !== "inline") throw new Error("Text appearance must be an authored SVS Recipe");
  return value.record.value.value as unknown as SvsRecipe;
}
function propNumber(value: SvsRecipe, name: string): number {
  const result = value.properties[name];
  if (typeof result !== "number" || !Number.isFinite(result)) throw new Error(`Text Recipe ${name} must be a number`);
  return result;
}
function propString(value: SvsRecipe, name: string): string {
  const result = value.properties[name];
  if (typeof result !== "string" || !result) throw new Error(`Text Recipe ${name} must be a string`);
  return result;
}

export const decodeTextTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  const trackAttributes = Object.keys(element.attributes).sort().join("\0");
  if (trackAttributes !== ["id", "space"].sort().join("\0")
    && trackAttributes !== ["id", "map", "space"].sort().join("\0")) {
    throw new Error(`${element.name} requires id and space; map is required when an Item uses a Selection`);
  }
  const id = text(element, "id");
  const space = ref(element, "space", programSpaceTypes.programSpace, resolveReference);
  const header = sealTextTrackHeader({ contract: "svml.text-track-header@1", id });
  const headerId = `${id}.header`;
  const records: Array<{
    id: string;
    type: typeof textTrackTypes.header | typeof textTrackTypes.itemSpec;
    value: { kind: "inline"; value: ReturnType<typeof sealTextTrackHeader> | TextItemSpec };
    range: typeof element.range;
  }> = [{ id: headerId, type: textTrackTypes.header, value: { kind: "inline", value: header }, range: element.range }];
  let itemIndex = 0;
  const items = element.children.flatMap((child) => {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Item children`);
      return [];
    }
    if (!child.name.endsWith(":Item") && child.name !== "Item") throw new Error(`${element.name} accepts only Item children`);
    itemIndex += 1;
    exact(child, ["text", "during", "appearance"]);
    const rawDuring = child.attributes.during;
    const selection = typeof rawDuring === "string"
      ? (() => {
          if (rawDuring.trim() !== "full") throw new Error(`${child.name}.during must be full or a NarrativeSelection reference`);
          return undefined;
        })()
      : ref(child, "during", narrativeTypes.selection, resolveReference);
    const appearance = recipe(ref(child, "appearance", svsRecipeType, resolveReference));
    const suffix = String(itemIndex).padStart(4, "0");
    const specId = `${id}.item.${suffix}.spec`;
    const spec = sealTextItemSpec({
      contract: "svml.text-item-spec@1",
      id: `item-${suffix}`,
      text: text(child, "text"),
      ...textAppearanceFromRecipe(appearance.properties),
    });
    records.push({ id: specId, type: textTrackTypes.itemSpec, value: { kind: "inline", value: spec }, range: child.range });
    return [{
      suffix,
      specId,
      specName: `item-${suffix}-spec`,
      ...(selection === undefined ? {} : { selection, selectionName: `item-${suffix}-selection` }),
    }];
  });
  if (items.length === 0) throw new Error(`${element.name} requires at least one Item`);
  const selected = items.filter((item) => item.selection !== undefined);
  const map = selected.length === 0
    ? undefined
    : ref(element, "map", semanticMapTypes.complete, resolveReference);
  if (selected.length === 0 && element.attributes.map !== undefined) {
    throw new Error(`${element.name}.map is unused because every Item uses during="full"`);
  }
  const fragmentItems: SurfaceItem[] = items.map((item) => ({
    suffix: item.suffix,
    specName: item.specName,
    ...(item.selectionName === undefined ? {} : { selectionName: item.selectionName }),
  }));
  const fragment = createTextTrackSurfaceFragment(id, fragmentItems);
  return {
    records,
    components: [{
      id,
      fragment: fragment.id,
      inputs: {
        space: space.ref,
        header: { kind: "record", id: headerId },
        ...(map === undefined ? {} : { map: map.ref }),
        ...Object.fromEntries(items.flatMap((item) => [
          [item.specName, { kind: "record" as const, id: item.specId }],
          ...(item.selection === undefined ? [] : [[item.selectionName!, item.selection.ref] as const]),
        ])),
      },
      outputs: { track: `${id}.track` },
      range: element.range,
    }],
    fragments: [fragment],
  };
};
