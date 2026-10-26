import { sameType } from "@hypit/hypit/protocol";
import { resolveTemporalContext } from "@hypit/temporal/markup";
import { blobTypes } from "@hypit/hypit/blob";
import { mediaTypes } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import { sealText, textTypes } from "@hypit/hypit/text";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceRecordDraft, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/hypit/markup";
import { resolveTemporalWindowReference, temporalWindowAttributeNames } from "@hypit/temporal/markup";

import { decodeCommentStickerStyle } from "./author.js";
import { createCommentStickerFragment } from "./fragment.js";
import { commentStickerTypes } from "./manifest.js";
import { sealCommentStickerHeader, sealCommentStickerItemSpec } from "./program.js";

const TIMING = temporalWindowAttributeNames;

function localName(name: string): string { return name.slice(name.lastIndexOf(":") + 1); }
function allowed(element: StructuredElement, names: readonly string[], required: readonly string[] = []): void {
  const unknown = Object.keys(element.attributes).filter((name) => !names.includes(name));
  if (unknown.length > 0) throw new Error(`${element.name} does not accept ${unknown[0]}.`);
  const missing = required.filter((name) => element.attributes[name] === undefined);
  if (missing.length > 0) throw new Error(`${element.name} requires ${missing.join(", ")}.`);
}
function text(element: StructuredElement, name: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${element.name}.${name} must be text.`);
  return value.trim();
}
function reference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: SurfaceResolvedReference["type"],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${label} has the wrong Type.`);
  return value;
}
function valueOf<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record === undefined) throw new Error(`${label} must reference authored data.`);
  return value.record.value as unknown as T;
}
function dedent(value: string): string {
  const lines = value.replace(/^\n/u, "").replace(/\n\s*$/u, "").split("\n");
  const indentation = lines.filter((line) => line.trim()).reduce(
    (minimum, line) => Math.min(minimum, /^\s*/u.exec(line)?.[0].length ?? 0), Number.POSITIVE_INFINITY,
  );
  return lines.map((line) => line.slice(Number.isFinite(indentation) ? indentation : 0)).join("\n").trim();
}

function graphText(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): string | SurfaceResolvedReference {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  return reference(raw, label, textTypes.text, resolve);
}

export const decodeCommentStickerStyleSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "recipe", "font"], ["id", "recipe", "font"]);
  if (element.children.some((child) => child.kind === "element" || child.value.trim())) throw new Error(`${element.name} must be empty.`);
  const id = text(element, "id");
  const recipeRef = reference(element.attributes.recipe, `${element.name}.recipe`, recipeType, resolveReference);
  const fontRef = reference(element.attributes.font, `${element.name}.font`, mediaTypes.fontStack, resolveReference);
  const style = decodeCommentStickerStyle(valueOf<Recipe>(recipeRef, `${element.name}.recipe`), valueOf<FontStackRef>(fontRef, `${element.name}.font`), id);
  return { records: [{ id, type: commentStickerTypes.style, value: (style), range: element.range }], components: [] };
};

export const decodeCommentStickerTrackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "timeline"], ["id", "timeline"]);
  const id = text(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const headerId = `${id}.__header`;
  const records: SurfaceRecordDraft[] = [{
    id: headerId,
    type: commentStickerTypes.header,
    value: (sealCommentStickerHeader({ id })),
    range: element.range,
  }];
  const inputs: Record<string, typeof context.timeline.ref> = { header: { kind: "record", id: headerId }, timeline: context.timeline.ref };
  const items: Parameters<typeof createCommentStickerFragment>[0][number][] = [];
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim()) throw new Error(`${element.name} accepts only Sticker children.`);
      continue;
    }
    if (localName(child.name) !== "Sticker") throw new Error(`${element.name} accepts only Sticker children.`);
    if (child.children.some((node) => node.kind === "element")) throw new Error(`${child.name} accepts plain comment text only.`);
    allowed(child, ["id", "comment", "frame", "style", "avatar", "author", "header", "meta", ...TIMING], ["id", "frame", "style"]);
    const itemId = text(child, "id");
    const window = resolveTemporalWindowReference({ element: child, resolveReference });
    const suffix = String(items.length + 1).padStart(4, "0");
    const frame = reference(child.attributes.frame, `${child.name}.frame`, spatialTypes.frame, resolveReference);
    const style = reference(child.attributes.style, `${child.name}.style`, commentStickerTypes.style, resolveReference);
    const avatar = child.attributes.avatar === undefined ? undefined : reference(child.attributes.avatar, `${child.name}.avatar`, blobTypes.blob, resolveReference);
    const comment = child.attributes.comment === undefined
      ? dedent(child.children.map((node) => node.kind === "text" ? node.value : "").join(""))
      : graphText(child.attributes.comment, `${child.name}.comment`, resolveReference);
    if (child.attributes.comment !== undefined && child.children.some((node) => node.kind === "element" || node.value.trim())) {
      throw new Error(`${child.name} cannot combine comment with body text.`);
    }
    if (typeof comment === "string" && !comment) throw new Error(`${child.name} requires comment text.`);
    const author = child.attributes.author === undefined ? undefined : graphText(child.attributes.author, `${child.name}.author`, resolveReference);
    const displayHeader = child.attributes.header === undefined ? undefined : graphText(child.attributes.header, `${child.name}.header`, resolveReference);
    const meta = child.attributes.meta === undefined ? undefined : graphText(child.attributes.meta, `${child.name}.meta`, resolveReference);
    const specId = `${id}.item.${suffix}.spec`;
    records.push({
      id: specId,
      type: commentStickerTypes.itemSpec,
      value: (sealCommentStickerItemSpec({

        id: itemId,
      })),
      range: child.range,
    });
    const windowName = `item-${suffix}-window`;
    const specName = `item-${suffix}-spec`; const frameName = `item-${suffix}-frame`; const styleName = `item-${suffix}-style`;
    inputs[specName] = { kind: "record", id: specId }; inputs[windowName] = window.ref;
    inputs[frameName] = frame.ref; inputs[styleName] = style.ref;
    const attachText = (field: string, value: string | SurfaceResolvedReference): string => {
      const name = `item-${suffix}-${field}`;
      if (typeof value === "string") {
        const recordId = `${id}.item.${suffix}.${field}`;
        records.push({ id: recordId, type: textTypes.text, value: (sealText(value)), range: child.range });
        inputs[name] = { kind: "record", id: recordId };
      } else inputs[name] = value.ref;
      return name;
    };
    const commentName = attachText("comment", comment);
    const authorName = author === undefined ? undefined : attachText("author", author);
    const headerTextName = displayHeader === undefined ? undefined : attachText("header", displayHeader);
    const metaName = meta === undefined ? undefined : attachText("meta", meta);
    const avatarName = avatar === undefined ? undefined : `item-${suffix}-avatar`;
    if (avatar !== undefined) inputs[avatarName!] = avatar.ref;
    const copy = { commentName, ...(authorName === undefined ? {} : { authorName }), ...(headerTextName === undefined ? {} : { headerTextName }), ...(metaName === undefined ? {} : { metaName }) };
    items.push({ windowName, specName, frameName, styleName, ...copy, ...(avatarName === undefined ? {} : { avatarName }) });
  }
  if (items.length === 0) throw new Error(`${element.name} requires at least one Sticker.`);
  const fragment = createCommentStickerFragment(items);
  return {
    records,
    components: [{ id, fragment, inputs, outputs: { program: `${id}.program`, visual: `${id}.visual` }, range: element.range }],
    exports: [`${id}.program`, `${id}.visual`],
  };
};
