import { resolveTemporalContext } from "@hypit/temporal/markup";
import { assertAttributes, assertEmptyElement, optionalTextAttribute, textAttribute, type MarkupAttributeValue, type StructuredSurfaceHandler, type SurfaceRecordDraft, type SurfaceResolvedReference } from "@hypit/hypit/markup";
import { blobTypes } from "@hypit/hypit/blob";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import { resolveTemporalInstantReference, resolveTemporalWindowReference, temporalWindowAttributeNames } from "@hypit/temporal/markup";

import { createEmojiRevealFragment } from "./fragment.js";
import { emojiRevealTypes } from "./manifest.js";
import { sealEmojiRevealHeader, sealEmojiRevealItemSpec } from "./program.js";
import { decodeEmojiRevealStyle } from "./style.js";

function reference(raw: MarkupAttributeValue | undefined, label: string, expected: TypeRef, resolve: (path: string) => SurfaceResolvedReference | undefined): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path); if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}
function valueOf<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record === undefined) throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value as unknown as T;
}

function boolean(element: Parameters<StructuredSurfaceHandler>[0]["element"], name: string, fallback: boolean): boolean {
  const source = optionalTextAttribute(element, name);
  if (source === undefined) return fallback;
  if (source === "true") return true;
  if (source === "false") return false;
  throw new Error(`${element.name}.${name} must be true or false.`);
}

export const decodeEmojiRevealStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "recipe"]); assertEmptyElement(element);
  const id = textAttribute(element, "id");
  const recipe = reference(element.attributes.recipe, `${element.name}.recipe`, recipeType, resolveReference);
  const style = decodeEmojiRevealStyle(id, valueOf<Recipe>(recipe, `${element.name}.recipe`));
  return { records: [{ id, type: emojiRevealTypes.style, value: (style as unknown as CanonicalValue), range: element.range }], components: [] };
};

export const decodeEmojiRevealTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  assertAttributes(element, ["id", "timeline", "within", "style", "placeholder", ...temporalWindowAttributeNames]);
  const id = textAttribute(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const within = reference(element.attributes.within, `${element.name}.within`, spatialTypes.frame, resolveReference);
  const style = reference(element.attributes.style, `${element.name}.style`, emojiRevealTypes.style, resolveReference);
  const placeholder = reference(element.attributes.placeholder, `${element.name}.placeholder`, blobTypes.blob, resolveReference);
  const outer = resolveTemporalWindowReference({ element, resolveReference });
  const headerId = `${id}.header`;
  const records: SurfaceRecordDraft[] = [{
    id: headerId, type: emojiRevealTypes.header,
    value: (sealEmojiRevealHeader({ id }) as unknown as CanonicalValue), range: element.range,
  }];
  const items: { specName: string; iconName: string; activationName?: string }[] = [];
  const inputs: Record<string, typeof context.timeline.ref> = {
    header: { kind: "record", id: headerId }, timeline: context.timeline.ref, within: within.ref, style: style.ref,
    placeholder: placeholder.ref, outer: outer.ref,
  };
  const ids = new Set<string>();
  let index = 0;
  for (const child of element.children) {
    if (child.kind === "text") { if (child.value.trim().length > 0) throw new Error(`${element.name} accepts only Item children.`); continue; }
    if (child.name.split(":").at(-1) !== "Item") throw new Error(`${element.name} accepts only Item children.`);
    assertAttributes(child, ["id", "icon", "preset", "at"]); assertEmptyElement(child);
    index += 1;
    const itemId = textAttribute(child, "id");
    if (ids.has(itemId)) throw new Error(`${element.name} contains duplicate Item id ${itemId}.`); ids.add(itemId);
    const preset = boolean(child, "preset", false);
    const timed = child.attributes.at !== undefined;
    if (preset && timed) throw new Error(`${child.name} cannot combine preset=true with at.`);
    if (!preset && !timed) throw new Error(`${child.name} requires at unless preset=true.`);
    const icon = reference(child.attributes.icon, `${child.name}.icon`, blobTypes.blob, resolveReference);
    const spec = sealEmojiRevealItemSpec({ id: itemId, preset });
    const suffix = String(index).padStart(4, "0");
    const specId = `${id}.item.${suffix}.spec`; const specName = `item-${suffix}-spec`;
    const iconName = `item-${suffix}-icon`;
    records.push({ id: specId, type: emojiRevealTypes.itemSpec, value: (spec as unknown as CanonicalValue), range: child.range });
    inputs[specName] = { kind: "record", id: specId }; inputs[iconName] = icon.ref;
    if (preset) items.push({ specName, iconName });
    else {
      const activation = resolveTemporalInstantReference({ element: child, resolveReference });
      const activationName = `item-${suffix}-activation`;
      inputs[activationName] = activation.ref;
      items.push({ specName, iconName, activationName });
    }
  }
  if (items.length === 0) throw new Error(`${element.name} requires at least one Item.`);
  const fragment = createEmojiRevealFragment(items);
  return {
    records,
    components: [{ id, fragment, inputs, outputs: { program: `${id}.program`, visual: `${id}.visual` }, range: element.range }],
    exports: [`${id}.program`, `${id}.visual`],
  };
};
