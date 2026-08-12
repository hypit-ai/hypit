import { artifactTypes } from "@narratage/artifact";
import { mediaTypes } from "@narratage/media";
import type { FontStackRef } from "@narratage/media";
import { mediaTrackTypes } from "@narratage/media-track";
import { narrativeTypes } from "@narratage/narrative";
import { programSpaceTypes } from "@narratage/program-space";
import type { TypeRef } from "@narratage/protocol";
import { semanticMapTypes } from "@narratage/semantic-map";
import { spatialTypes } from "@narratage/spatial";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import { sealText, textTypes } from "@narratage/text";
import { sealGraphFragment } from "@narratage/elaborator";
import type { AuthorValueRef } from "@narratage/elaborator";
import type {
  StructuredElement,
  StructuredSurfaceHandler,
  SurfaceRecordDraft,
  SurfaceResolvedReference,
  MarkupAttributeValue,
} from "@narratage/markup";

import {
  decodeDepthStackCardSpec,
  decodeDepthStackMaterial,
  decodeDepthStackSpec,
} from "./author.js";
import {
  createDepthStackFragment,
} from "./fragment.js";
import type {
  DepthStackFragmentCard,
  DepthStackFragmentTerminal,
} from "./fragment.js";
import { depthStackProducers, depthStackTypes } from "./manifest.js";
import {
  noDepthStackCardLabel,
  sealDepthStackCardLabelStyle,
  sealDepthStackHeader,
} from "./program.js";
import type { DepthStackCardLabelStyle } from "./types.js";

function sameType(left: TypeRef, right: TypeRef): boolean {
  return left.module.name === right.module.name && left.module.version === right.module.version && left.name === right.name;
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

function inline<T>(value: SurfaceResolvedReference, label: string): T {
  if (value.record?.value.kind !== "inline") throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value.value as unknown as T;
}

function recipe(
  raw: MarkupAttributeValue | undefined,
  label: string,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): SvsRecipe {
  return inline<SvsRecipe>(reference(raw, label, svsRecipeType, resolve), label);
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
    name: `@narratage/deck-track/label-surface/${id}@1`,
    inputs: [{ name: "style", type: depthStackTypes.cardLabelStyle }, { name: "content", type: textTypes.text }],
    operations: [{
      id: "bind", producer: depthStackProducers.bindLabelText,
      inputs: { style: input("style"), content: input("content") }, result: { kind: "output", name: "label" },
    }],
    exports: [{ name: "label", type: depthStackTypes.cardLabel, root: operation }],
  });
}

export const decodeDepthStackLabelSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "content", "font", "size", "color", "align", "block", "padding"]);
  const id = text(element, "id");
  const stack = inline<FontStackRef>(reference(element.attributes.font, `${element.name}.font`, mediaTypes.fontStack, resolveReference), `${element.name}.font`);
  const primary = stack.faces[0];
  if (primary === undefined) throw new Error(`${element.name}.font stack is empty.`);
  const align = text(element, "align", "center");
  const block = text(element, "block", "end");
  if (!["start", "center", "end", "justify"].includes(align)) throw new Error(`${element.name}.align is invalid.`);
  if (!["start", "center", "end"].includes(block)) throw new Error(`${element.name}.block is invalid.`);
  const padding = numeric(element, "padding", 20);
  const style: DepthStackCardLabelStyle = sealDepthStackCardLabelStyle({
    contract: "svml.depth-stack-card-label-style@1",
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
  const records: SurfaceRecordDraft[] = [{ id: styleId, type: depthStackTypes.cardLabelStyle, value: { kind: "inline", value: style }, range: element.range }];
  let contentRef: AuthorValueRef;
  if (element.attributes.content === undefined) {
    const contentId = `${id}.__content`;
    records.push({ id: contentId, type: textTypes.text, value: { kind: "inline", value: sealText(labelText(element)) }, range: element.range });
    contentRef = { kind: "record", id: contentId };
  } else {
    empty(element);
    contentRef = reference(element.attributes.content, `${element.name}.content`, textTypes.text, resolveReference).ref;
  }
  const fragment = labelFragment(id);
  return {
    records,
    components: [{ id, fragment: fragment.id, inputs: { style: { kind: "record", id: styleId }, content: contentRef }, outputs: { label: id }, range: element.range }],
    fragments: [fragment],
  };
};

function terminal(
  element: StructuredElement,
  resolve: (path: string) => SurfaceResolvedReference | undefined,
): { readonly terminal: DepthStackFragmentTerminal; readonly reference?: SurfaceResolvedReference } {
  const raw = element.attributes.until;
  if (typeof raw === "string") {
    if (raw.trim() !== "program.end") throw new Error(`${element.name}.until text must be program.end.`);
    if (element.attributes["until-boundary"] !== undefined) throw new Error(`${element.name}.until-boundary requires a Selection.`);
    return { terminal: { kind: "program-end" } };
  }
  const value = oneOfReference(raw, `${element.name}.until`, [narrativeTypes.moment, narrativeTypes.selection], resolve);
  if (sameType(value.type, narrativeTypes.moment)) {
    if (element.attributes["until-boundary"] !== undefined) throw new Error(`${element.name}.until-boundary requires a Selection.`);
    return { terminal: { kind: "moment", inputName: "terminal" }, reference: value };
  }
  const boundary = text(element, "until-boundary", "end");
  if (boundary !== "start" && boundary !== "end") throw new Error(`${element.name}.until-boundary is invalid.`);
  return { terminal: { kind: boundary === "start" ? "selection-start" : "selection-end", inputName: "terminal" }, reference: value };
}

export const decodeDepthStackSurface: StructuredSurfaceHandler = ({ element, resolveReference }) => {
  allowed(element, ["id", "map", "space", "canvas", "frame", "appearance", "until", "until-boundary"]);
  const id = text(element, "id");
  const map = reference(element.attributes.map, `${element.name}.map`, semanticMapTypes.complete, resolveReference);
  const space = reference(element.attributes.space, `${element.name}.space`, programSpaceTypes.programSpace, resolveReference);
  const canvas = reference(element.attributes.canvas, `${element.name}.canvas`, spatialTypes.canvas, resolveReference);
  const frame = reference(element.attributes.frame, `${element.name}.frame`, spatialTypes.frame, resolveReference);
  const appearance = recipe(element.attributes.appearance, `${element.name}.appearance`, resolveReference);
  const terminalValue = terminal(element, resolveReference);
  const records: SurfaceRecordDraft[] = [];
  const headerId = `${id}.header`;
  const specId = `${id}.spec`;
  records.push(
    { id: headerId, type: depthStackTypes.header, value: { kind: "inline", value: sealDepthStackHeader({ contract: "svml.depth-stack-header@1", id }) }, range: element.range },
    { id: specId, type: depthStackTypes.spec, value: { kind: "inline", value: decodeDepthStackSpec(appearance) }, range: element.range },
  );
  const inputs: Record<string, typeof map.ref> = {
    canvas: canvas.ref, frame: frame.ref, header: { kind: "record", id: headerId }, map: map.ref,
    space: space.ref, spec: { kind: "record", id: specId },
  };
  if (terminalValue.reference !== undefined) inputs.terminal = terminalValue.reference.ref;
  const cards: DepthStackFragmentCard[] = [];
  let cardIndex = 0;
  for (const child of element.children) {
    if (child.kind === "text") {
      if (child.value.trim().length > 0) throw new Error(`${element.name} accepts Card children only.`);
      continue;
    }
    if (child.name.split(":").at(-1) !== "Card") throw new Error(`${element.name} accepts Card children only.`);
    allowed(child, ["id", "source", "extent", "at", "appearance", "label"]);
    empty(child);
    cardIndex += 1;
    const suffix = String(cardIndex).padStart(4, "0");
    const cardId = text(child, "id");
    const source = oneOfReference(child.attributes.source, `${child.name}.source`, [artifactTypes.blob, mediaTypes.synchronized, mediaTypes.compositableSurface], resolveReference);
    const sourceKind = sameType(source.type, artifactTypes.blob) ? "still"
      : sameType(source.type, mediaTypes.synchronized) ? "timed" : "surface";
    const extent = child.attributes.extent === undefined ? undefined
      : reference(child.attributes.extent, `${child.name}.extent`, spatialTypes.extent, resolveReference);
    if (sourceKind === "still" && extent === undefined) throw new Error(`${child.name}.extent is required for a still image.`);
    if (sourceKind !== "still" && extent !== undefined) throw new Error(`${child.name}.extent belongs only to a still image.`);
    const moment = reference(child.attributes.at, `${child.name}.at`, narrativeTypes.moment, resolveReference);
    const cardAppearance = child.attributes.appearance === undefined
      ? appearance : recipe(child.attributes.appearance, `${child.name}.appearance`, resolveReference);
    const material = decodeDepthStackMaterial(cardAppearance, `${id}.${cardId}`, sourceKind);
    const fitId = `${id}.card.${suffix}.fit`;
    const sampleId = `${id}.card.${suffix}.sample-spec`;
    const cardSpecId = `${id}.card.${suffix}.card-spec`;
    records.push(
      { id: fitId, type: spatialTypes.fit, value: { kind: "inline", value: material.fit }, range: child.range },
      { id: sampleId, type: mediaTrackTypes.sampleLayerSpec, value: { kind: "inline", value: material.sample }, range: child.range },
      { id: cardSpecId, type: depthStackTypes.cardSpec, value: { kind: "inline", value: decodeDepthStackCardSpec(cardAppearance, cardId) }, range: child.range },
    );
    const sourceName = `card-${suffix}-source`;
    const fitName = `card-${suffix}-fit`;
    const sampleSpecName = `card-${suffix}-sample-spec`;
    const cardSpecName = `card-${suffix}-spec`;
    const momentName = `card-${suffix}-moment`;
    const labelName = `card-${suffix}-label`;
    inputs[sourceName] = source.ref;
    inputs[fitName] = { kind: "record", id: fitId };
    inputs[sampleSpecName] = { kind: "record", id: sampleId };
    inputs[cardSpecName] = { kind: "record", id: cardSpecId };
    inputs[momentName] = moment.ref;
    let labelRef: typeof map.ref;
    if (child.attributes.label === undefined) {
      const labelId = `${id}.card.${suffix}.label-none`;
      records.push({ id: labelId, type: depthStackTypes.cardLabel, value: { kind: "inline", value: noDepthStackCardLabel() }, range: child.range });
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
      records.push({ id: paintId, type: mediaTrackTypes.paintLayerSpec, value: { kind: "inline", value: material.framePaint }, range: child.range });
      inputs[framePaintSpecName] = { kind: "record", id: paintId };
    }
    cards.push({
      suffix, sourceKind, sourceName, ...(extentName === undefined ? {} : { extentName }), fitName, sampleSpecName,
      ...(framePaintSpecName === undefined ? {} : { framePaintSpecName }), labelName, cardSpecName, momentName,
    });
  }
  if (cards.length === 0) throw new Error(`${element.name} requires at least one Card.`);
  const fragment = createDepthStackFragment(cards, terminalValue.terminal, `@narratage/deck-track/surface/${id}@1`);
  return {
    records,
    components: [{ id, fragment: fragment.id, inputs, outputs: { program: `${id}.program`, track: `${id}.track` }, range: element.range }],
    fragments: [fragment],
  };
};
