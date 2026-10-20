import { sameType } from "@hypit/hypit/protocol";
import { resolveTemporalContext } from "@hypit/temporal/markup";
import { blobTypes } from "@hypit/hypit/blob";
import { mediaTypes } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import { visualTrackTypes } from "@hypit/visual-track";
import type { TypeRef } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import { resolveTemporalInstantReference, temporalInstantAttributeNames } from "@hypit/temporal/markup";
import type { Recipe } from "@hypit/hypit/recipe";
import { sealText, textTypes } from "@hypit/hypit/text";
import { sealGraphFragment } from "@hypit/hypit/author";
import type { AuthorValueRef } from "@hypit/hypit/author";
import type { StructuredElement, StructuredSurfaceHandler, SurfaceComponentDraft, SurfaceRecordDraft, SurfaceResolvedReference, MarkupAttributeValue } from "@hypit/hypit/markup";

import {
  decodeDepthStackCardSpec,
  decodeDepthStackMaterial,
  decodeDepthStackSpec,
} from "./author.js";
import {
  createDepthStackFragment,
} from "./fragment.js";
import type { DepthStackFragmentCard } from "./fragment.js";
import { depthStackProducers, depthStackTypes } from "./manifest.js";
import {
  noDepthStackCardLabel,
  sealDepthStackCardLabelStyle,
  sealDepthStackHeader,
} from "./program.js";
import type { DepthStackCardLabelStyle } from "./types.js";

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

function numeric(element: StructuredElement, name: string, fallback: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be numeric.`);
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

function oneOfReference(
  raw: MarkupAttributeValue | undefined,
  label: string,
  expected: readonly TypeRef[],
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SurfaceResolvedReference {
  if (typeof raw !== "object" || raw.kind !== "reference") throw new Error(`${label} must be a reference.`);
  const value = resolve(raw.path);
  if (value === undefined || !expected.some((type) => sameType(value.type, type))) throw new Error(`${label} has the wrong Type.`);
  return value;
}

function valueOf<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record === undefined) throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value as unknown as T;
}

function recipe(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): Recipe {
  return valueOf<Recipe>(reference(raw, label, recipeType, resolve), label);
}

function labelText(element: StructuredElement): string {
  if (element.children.some((child) => child.kind === "element")) throw new Error(`${element.name} accepts plain label text only.`);
  const value = element.children.map((child) => child.kind === "text" ? child.value : "").join("").trim();
  if (value.length === 0) throw new Error(`${element.name} label text is empty.`);
  return value;
}

function labelFragment(id: string) {
  const input = (name: string) => ({ kind: "fragment-input" as const, name });
  const operation = { kind: "fragment-operation" as const, operation: "bind" };
  return sealGraphFragment({
    inputs: [{ name: "style", type: depthStackTypes.cardLabelStyle }, { name: "content", type: textTypes.text }],
    operations: [{
      id: "bind", producer: depthStackProducers.bindLabelText,
      inputs: { style: input("style"), content: input("content") }, result: { kind: "output" as const, name: "label" },
    }],
    exports: [{ name: "label", type: depthStackTypes.cardLabel, root: operation }],
  });
}

export const decodeDepthStackLabelSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "content", "font", "size", "color", "align", "block", "padding"]);
  const id = text(element, "id");
  const stack = valueOf<FontStackRef>(reference(element.attributes.font, `${element.name}.font`, mediaTypes.fontStack, resolveReference), `${element.name}.font`);
  const primary = stack.faces[0];
  if (primary === undefined) throw new Error(`${element.name}.font stack is empty.`);
  const align = text(element, "align", "center");
  const block = text(element, "block", "end");
  if (!["start", "center", "end", "justify"].includes(align)) throw new Error(`${element.name}.align is invalid.`);
  if (!["start", "center", "end"].includes(block)) throw new Error(`${element.name}.block is invalid.`);
  const padding = numeric(element, "padding", 20);
  const style: DepthStackCardLabelStyle = sealDepthStackCardLabelStyle({

    typography: {
      fonts: structuredClone(stack.faces), sizePx: numeric(element, "size", 34), weight: primary.weight, style: primary.style,
      axes: [], features: [], synthesis: "none", kerning: "normal", trackingPx: 0, wordSpacingPx: 0,
      lineHeight: 1.15, direction: "auto", writingMode: "horizontal-tb", baselineShiftPx: 0, tabSize: 4,
      indentationPx: 0, paragraphBeforePx: 0, paragraphAfterPx: 0, transform: "none", variantCaps: "normal",
      verticalAlign: "baseline", decorations: [], cjk: { textSpacing: "normal", punctuationTrim: "none" },
    },
    paints: [{ kind: "fill", paint: { kind: "solid", color: text(element, "color", "#ffffff") } }],
    flow: {
      form: { kind: "area" }, inlineSize: "fixed", blockSize: "fixed",
      paddingPx: { inlineStart: padding, inlineEnd: padding, blockStart: padding, blockEnd: padding },
      inlineAlign: align as "start" | "center" | "end" | "justify",
      blockAlign: block as "start" | "center" | "end",
      wrap: "word", overflow: "clip", clipToFrame: true, columns: 1, columnGapPx: 0, metricEdge: "line-box",
    },
  });
  const styleId = `${id}.__style`;
  const records: SurfaceRecordDraft[] = [{ id: styleId, type: depthStackTypes.cardLabelStyle, value: (style), range: element.range }];
  let contentRef: AuthorValueRef;
  if (element.attributes.content === undefined) {
    const contentId = `${id}.__content`;
    records.push({ id: contentId, type: textTypes.text, value: (sealText(labelText(element))), range: element.range });
    contentRef = { kind: "record", id: contentId };
  } else {
    empty(element);
    contentRef = reference(element.attributes.content, `${element.name}.content`, textTypes.text, resolveReference).ref;
  }
  const fragment = labelFragment(id);
  return {
    records,
    components: [{ id, fragment, inputs: { style: { kind: "record", id: styleId }, content: contentRef }, outputs: { label: id }, range: element.range }],
  };
};

export const decodeDepthStackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "timeline", "frame", "appearance", "until"]);
  const id = text(element, "id");
  const context = resolveTemporalContext({ element, resolveReference });
  const frame = reference(element.attributes.frame, `${element.name}.frame`, spatialTypes.frame, resolveReference);
  const appearance = recipe(element.attributes.appearance, `${element.name}.appearance`, resolveReference);
  const terminal = resolveTemporalInstantReference({ element, resolveReference, attribute: "until" });
  const records: SurfaceRecordDraft[] = [];
  const headerId = `${id}.header`;
  const specId = `${id}.spec`;
  records.push(
    { id: headerId, type: depthStackTypes.header, value: (sealDepthStackHeader({ id })), range: element.range },
    { id: specId, type: depthStackTypes.spec, value: (decodeDepthStackSpec(appearance)), range: element.range },
  );
  const inputs: Record<string, typeof context.timeline.ref> = {
    frame: frame.ref, header: { kind: "record", id: headerId }, timeline: context.timeline.ref,
    spec: { kind: "record", id: specId }, terminal: terminal.ref,
  };
  const cards: DepthStackFragmentCard[] = [];
  let cardIndex = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts Card children only.`);
      continue;
    }
    if (child.name.split(":").at(-1) !== "Card") throw new Error(`${element.name} accepts Card children only.`);
    allowed(child, ["id", "source", "extent", ...temporalInstantAttributeNames, "appearance", "label"]);
    empty(child);
    cardIndex += 1;
    const suffix = String(cardIndex).padStart(4, "0");
    const cardId = text(child, "id");
    const source = oneOfReference(child.attributes.source, `${child.name}.source`, [blobTypes.blob, mediaTypes.synchronized, mediaTypes.compositableSurface], resolveReference);
    const sourceKind = sameType(source.type, blobTypes.blob) ? "still"
      : sameType(source.type, mediaTypes.synchronized) ? "timed" : "surface";
    const extent = child.attributes.extent === undefined ? undefined
      : reference(child.attributes.extent, `${child.name}.extent`, spatialTypes.extent, resolveReference);
    if (sourceKind === "still" && extent === undefined) throw new Error(`${child.name}.extent is required for a still image.`);
    if (sourceKind !== "still" && extent !== undefined) throw new Error(`${child.name}.extent belongs only to a still image.`);
    const activation = resolveTemporalInstantReference({ element: child, resolveReference });
    const cardAppearance = child.attributes.appearance === undefined
      ? appearance : recipe(child.attributes.appearance, `${child.name}.appearance`, resolveReference);
    const material = decodeDepthStackMaterial(cardAppearance, `${id}.${cardId}`, sourceKind);
    const fitId = `${id}.card.${suffix}.fit`;
    const sampleId = `${id}.card.${suffix}.sample-spec`;
    const cardSpecId = `${id}.card.${suffix}.card-spec`;
    records.push(
      { id: fitId, type: spatialTypes.fit, value: (material.fit), range: child.range },
      { id: sampleId, type: visualTrackTypes.sampleLayerSpec, value: (material.sample), range: child.range },
      { id: cardSpecId, type: depthStackTypes.cardSpec, value: (decodeDepthStackCardSpec(cardAppearance, cardId)), range: child.range },
    );
    const sourceName = `card-${suffix}-source`;
    const fitName = `card-${suffix}-fit`;
    const sampleSpecName = `card-${suffix}-sample-spec`;
    const cardSpecName = `card-${suffix}-spec`;
    const activationName = `card-${suffix}-activation`;
    const labelName = `card-${suffix}-label`;
    inputs[sourceName] = source.ref;
    inputs[fitName] = { kind: "record", id: fitId };
    inputs[sampleSpecName] = { kind: "record", id: sampleId };
    inputs[cardSpecName] = { kind: "record", id: cardSpecId };
    inputs[activationName] = activation.ref;
    let labelRef: typeof context.timeline.ref;
    if (child.attributes.label === undefined) {
      const labelId = `${id}.card.${suffix}.label-none`;
      records.push({ id: labelId, type: depthStackTypes.cardLabel, value: (noDepthStackCardLabel()), range: child.range });
      labelRef = { kind: "record", id: labelId };
    } else {
      labelRef = reference(child.attributes.label, `${child.name}.label`, depthStackTypes.cardLabel, resolveReference).ref;
    }
    inputs[labelName] = labelRef;
    let extentName: string | undefined;
    if (extent !== undefined) {
      extentName = `card-${suffix}-extent`;
      inputs[extentName] = extent.ref;
    }
    let framePaintSpecName: string | undefined;
    if (material.framePaint !== undefined) {
      framePaintSpecName = `card-${suffix}-frame-paint`;
      const paintId = `${id}.card.${suffix}.frame-paint`;
      records.push({ id: paintId, type: visualTrackTypes.paintLayerSpec, value: (material.framePaint), range: child.range });
      inputs[framePaintSpecName] = { kind: "record", id: paintId };
    }
    cards.push({
      suffix, sourceKind, sourceName, ...(extentName === undefined ? {} : { extentName }), fitName, sampleSpecName,
      ...(framePaintSpecName === undefined ? {} : { framePaintSpecName }), labelName, cardSpecName, activationName,
    });
  }
  if (cards.length === 0) throw new Error(`${element.name} requires at least one Card.`);
  const fragment = createDepthStackFragment(cards, "terminal");
  return {
    records,
    components: [{ id, fragment, inputs, outputs: { program: `${id}.program`, visual: `${id}.visual` }, range: element.range }],
    exports: [`${id}.program`, `${id}.visual`],
  };
};
