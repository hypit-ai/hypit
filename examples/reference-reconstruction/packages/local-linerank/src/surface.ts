import { mediaTypes } from "@hypit/media";
import { narrativeTypes } from "@hypit/narrative";
import { programSpaceTypes } from "@hypit/program-space";
import type { CanonicalValue, TypeRef } from "@hypit/protocol";
import { semanticMapTypes } from "@hypit/semantic-map";
import { spatialTypes } from "@hypit/spatial";
import { svsRecipeType } from "@hypit/svs";
import type { SvsRecipe } from "@hypit/svs";
import { textTypes } from "@hypit/text";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@hypit/markup";

import { createLinerankFragment } from "./fragment.js";
import type { LinerankFragmentItem } from "./fragment.js";
import { linerankTypes } from "./manifest.js";
import {
  assertLinerankItemSpec,
  sealLinerankHeader,
} from "./schedule.js";
import { decodeLinerankStyle } from "./style.js";
import type { LinerankItemSpec } from "./types.js";

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name
    && left.module.version === right.module.version
    && left.name === right.name;
}

function allowed(element: StructuredElement, names: readonly string[]): void {
  const permit = new Set(names);
  const unknown = Object.keys(element.attributes).filter((name) => !permit.has(name));
  if (unknown.length > 0) throw new Error(`${element.name} has unsupported attributes ${unknown.join(", ")}.`);
}

function empty(element: StructuredElement): void {
  if (element.children.some((child) => child.kind === "element" || child.value.trim().length > 0)) {
    throw new Error(`${element.name} must be empty.`);
  }
}

function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function optionalText(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}

function integer(element: StructuredElement, name: string): number | undefined {
  const source = optionalText(element, name);
  if (source === undefined) return undefined;
  const value = Number(source);
  if (!Number.isSafeInteger(value)) throw new Error(`${element.name}.${name} must be an integer.`);
  return value;
}

function reference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: TypeRef,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function inline<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record?.value.kind !== "inline") throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value.value as unknown as T;
}

export const decodeLinerankStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "recipe", "font"]);
  empty(element);
  const id = text(element, "id");
  const recipeRef = reference(element.attributes.recipe, `${element.name}.recipe`, svsRecipeType, resolveReference);
  const fontRef = reference(element.attributes.font, `${element.name}.font`, mediaTypes.fontStack, resolveReference);
  const decoded = decodeLinerankStyle(inline<SvsRecipe>(recipeRef, `${element.name}.recipe`), inline(fontRef, `${element.name}.font`));
  return {
    records: [
      { id, type: linerankTypes.style, value: { kind: "inline", value: decoded as unknown as CanonicalValue }, range: element.range },
    ],
    components: [], fragments: [],
  };
};

function localName(element: StructuredElement): string {
  return element.name.slice(element.name.lastIndexOf(":") + 1);
}

function textValue(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): string | SurfaceResolvedReference {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return reference(raw, label, textTypes.text, resolve);
}

export const decodeLinerankBoardSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "map", "space", "frame", "during", "triggers", "terminal", "style", "title"]);
  const id = text(element, "id");
  const map = reference(element.attributes.map, `${element.name}.map`, semanticMapTypes.complete, resolveReference);
  const space = reference(element.attributes.space, `${element.name}.space`, programSpaceTypes.programSpace, resolveReference);
  const frame = reference(element.attributes.frame, `${element.name}.frame`, spatialTypes.frame, resolveReference);
  const outer = reference(element.attributes.during, `${element.name}.during`, narrativeTypes.selection, resolveReference);
  const triggers = reference(element.attributes.triggers, `${element.name}.triggers`, narrativeTypes.moment, resolveReference);
  const terminal = reference(element.attributes.terminal, `${element.name}.terminal`, narrativeTypes.moment, resolveReference);
  const style = reference(element.attributes.style, `${element.name}.style`, linerankTypes.style, resolveReference);

  const records: SurfaceRecordDraft[] = [];
  const headerId = `${id}.header`;
  records.push({
    id: headerId, type: linerankTypes.header,
    value: { kind: "inline", value: sealLinerankHeader({ id }) as unknown as CanonicalValue },
    range: element.range,
  });

  const titleValue = textValue(element.attributes.title, `${element.name}.title`, resolveReference);

  const inputs: Record<string, typeof map.ref> = {
    header: { kind: "record", id: headerId }, map: map.ref, space: space.ref, frame: frame.ref,
    outer: outer.ref, triggers: triggers.ref, terminal: terminal.ref, style: style.ref,
  };
  if (typeof titleValue === "string") {
    const titleId = `${id}.title`;
    records.push({
      id: titleId, type: textTypes.text,
      value: { kind: "inline", value: { value: titleValue } as unknown as CanonicalValue },
      range: element.range,
    });
    inputs.title = { kind: "record", id: titleId };
  } else {
    inputs.title = titleValue.ref;
  }

  const items: LinerankFragmentItem[] = [];
  const itemIds = new Set<string>();
  let index = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts BoardItem children only.`);
      continue;
    }
    if (localName(child) !== "BoardItem") throw new Error(`${element.name} accepts BoardItem children only.`);
    allowed(child, ["id", "rank", "label"]);
    empty(child);
    index += 1;
    const suffix = String(index).padStart(4, "0");
    const itemId = optionalText(child, "id") ?? `item-${suffix}`;
    if (itemIds.has(itemId)) throw new Error(`${element.name} has duplicate Item id ${itemId}.`);
    itemIds.add(itemId);
    const rank = integer(child, "rank");
    if (rank === undefined || rank < 1) throw new Error(`${child.name}.rank must be a positive integer.`);
    const label = textValue(child.attributes.label, `${child.name}.label`, resolveReference);
    const specId = `${id}.item.${suffix}.spec`;
    const specName = `item-${suffix}-spec`;
    if (typeof label === "string") {
      const spec: LinerankItemSpec = { id: itemId, rank, label };
      assertLinerankItemSpec(spec);
      records.push({ id: specId, type: linerankTypes.itemSpec, value: { kind: "inline", value: spec as unknown as CanonicalValue }, range: child.range });
      inputs[specName] = { kind: "record", id: specId };
      items.push({ suffix, specName });
    } else {
      records.push({ id: specId, type: linerankTypes.textItemShell, value: { kind: "inline", value: { id: itemId, rank } as unknown as CanonicalValue }, range: child.range });
      inputs[specName] = { kind: "record", id: specId };
      const contentName = `item-${suffix}-content`;
      inputs[contentName] = label.ref;
      items.push({ suffix, specName, contentName });
    }
  }
  if (items.length === 0) throw new Error(`${element.name} requires at least one BoardItem.`);

  const fragment = createLinerankFragment(items);
  return {
    records,
    components: [{
      id, fragment: fragment.id, inputs,
      outputs: {
        schedule: `${id}.schedule`, program: `${id}.program`, visual: `${id}.visual`,
      },
      range: element.range,
    }],
    fragments: [fragment],
  };
};
