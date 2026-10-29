import { sameType } from "@hypit/hypit/protocol";
import type { TypeRef } from "@hypit/hypit/protocol";
import { blobTypes } from "@hypit/hypit/blob";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes, pictureInterpretationProfile } from "@hypit/media";
import type { FontStackRef } from "@hypit/media";
import { visualTrackTypes } from "@hypit/visual-track";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/hypit/recipe";
import type { Recipe } from "@hypit/hypit/recipe";
import { sealText, textTypes } from "@hypit/hypit/text";
import { declarationBody, declarationField, sealGraphFragment } from "@hypit/hypit/author";
import type {
  AuthorDeclaration,
  AuthorDeclarationBinding,
  AuthorDeclarationChild,
  AuthorDeclarationCompiler,
  AuthorRecordDraft,
  AuthorResolvedReference,
  AuthorValueRef,
} from "@hypit/hypit/author";
import { temporalTypes } from "@hypit/temporal";
import { timelineTypes } from "@hypit/timeline";

import {
  decodeDepthStackCardSpec,
  decodeDepthStackMaterial,
  decodeDepthStackSpec,
} from "./author.js";
import {
  createDepthStackFragment,
} from "./fragment.js";
import type { DepthStackFragmentCard } from "./fragment.js";
import { depthStackModuleRef, depthStackProducers, depthStackTypes } from "./manifest.js";
import {
  noDepthStackCardLabel,
  sealDepthStackCardLabelStyle,
  sealDepthStackHeader,
} from "./program.js";
import type { DepthStackCardLabelStyle } from "./types.js";

type DeclarationNode = AuthorDeclaration | AuthorDeclarationChild;

function field(element: DeclarationNode, name: string) {
  return declarationField(element, name);
}

function text(element: DeclarationNode, name: string, fallback?: string): string {
  const value = field(element, name);
  if (value === undefined && fallback !== undefined) return fallback;
  if (value?.kind !== "literal" || value.value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.value.trim();
}

function optionalText(element: DeclarationNode, name: string): string | undefined {
  const value = field(element, name);
  if (value === undefined) return undefined;
  if (value.kind !== "literal" || value.value.trim().length === 0) throw new Error(`${element.name}.${name} must be text.`);
  return value.value.trim();
}

function numeric(element: DeclarationNode, name: string, fallback: number): number {
  const raw = optionalText(element, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${element.name}.${name} must be numeric.`);
  return value;
}

async function reference(
  element: DeclarationNode,
  name: string,
  expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const raw = field(element, name);
  if (raw?.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const value = await resolve(raw.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`${element.name}.${name} has the wrong Type.`);
  return value;
}

async function oneOfReference(
  element: DeclarationNode,
  name: string,
  expected: readonly TypeRef[],
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<AuthorResolvedReference> {
  const raw = field(element, name);
  if (raw?.kind !== "reference") throw new Error(`${element.name}.${name} must be a reference.`);
  const value = await resolve(raw.path);
  if (value === undefined || !expected.some((type) => sameType(value.type, type))) throw new Error(`${element.name}.${name} has the wrong Type.`);
  return value;
}

function valueOf<T>(value: AuthorResolvedReference, label: string): T {
  if (value.record === undefined) throw new Error(`${label} must resolve during author compilation.`);
  return value.record.value as unknown as T;
}

async function recipe(
  element: DeclarationNode,
  name: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<Recipe> {
  return valueOf<Recipe>(await reference(element, name, recipeType, resolve), `${element.name}.${name}`);
}

function labelText(element: DeclarationNode): string {
  const value = declarationBody(element).map((child) => child.kind === "text" ? child.value : "").join("").trim();
  if (value.length === 0) throw new Error(`${element.name} label text is empty.`);
  return value;
}

function labelFragment() {
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

async function compileDepthStackLabel({
  declaration: element,
  resolveReference,
}: Parameters<AuthorDeclarationCompiler["compile"]>[0]) {
  const id = text(element, "id");
  const stack = valueOf<FontStackRef>(await reference(element, "font", mediaTypes.fontStack, resolveReference), `${element.name}.font`);
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
  const records: AuthorRecordDraft[] = [{ id: styleId, type: depthStackTypes.cardLabelStyle, value: (style), range: element.range }];
  let contentRef: AuthorValueRef;
  if (field(element, "content") === undefined) {
    const contentId = `${id}.__content`;
    records.push({ id: contentId, type: textTypes.text, value: (sealText(labelText(element))), range: element.range });
    contentRef = { kind: "record", id: contentId };
  } else {
    if (declarationBody(element).some((part) => part.kind === "text" && part.value.trim().length > 0)) {
      throw new Error(`${element.name} cannot combine content with body text.`);
    }
    contentRef = (await reference(element, "content", textTypes.text, resolveReference)).ref;
  }
  const fragment = labelFragment();
  return {
    records,
    components: [{ id, fragment, inputs: { style: { kind: "record" as const, id: styleId }, content: contentRef }, outputs: { label: id }, range: element.range }],
  };
}

async function compileDepthStack({
  declaration: element,
  resolveReference,
}: Parameters<AuthorDeclarationCompiler["compile"]>[0]) {
  const id = text(element, "id");
  const timeline = await reference(element, "timeline", timelineTypes.timeline, resolveReference);
  const frame = await reference(element, "frame", spatialTypes.frame, resolveReference);
  const appearance = await recipe(element, "appearance", resolveReference);
  const terminal = await reference(element, "until", temporalTypes.instant, resolveReference);
  const records: AuthorRecordDraft[] = [];
  const headerId = `${id}.header`;
  const specId = `${id}.spec`;
  records.push(
    { id: headerId, type: depthStackTypes.header, value: (sealDepthStackHeader({ id })), range: element.range },
    { id: specId, type: depthStackTypes.spec, value: (decodeDepthStackSpec(appearance)), range: element.range },
  );
  const inputs: Record<string, AuthorValueRef> = {
    frame: frame.ref, header: { kind: "record", id: headerId }, timeline: timeline.ref,
    spec: { kind: "record", id: specId }, terminal: terminal.ref,
  };
  const cards: DepthStackFragmentCard[] = [];
  let cardIndex = 0;
  for (const child of element.children) {
    const range = child.range ?? element.range;
    cardIndex += 1;
    const suffix = String(cardIndex).padStart(4, "0");
    const cardId = text(child, "id");
    const source = await oneOfReference(child, "source", [blobTypes.blob, mediaTypes.prepared, mediaTypes.compositableSurface], resolveReference);
    const sourceKind = sameType(source.type, blobTypes.blob) ? "still"
      : sameType(source.type, mediaTypes.prepared) ? "timed" : "surface";
    const pictureField = field(child, "picture");
    if (sourceKind === "still" && pictureField === undefined) {
      throw new Error(`${child.name}.picture is required for a still image.`);
    }
    if (sourceKind !== "still" && pictureField !== undefined) {
      throw new Error(`${child.name}.picture belongs only to a still image.`);
    }
    const extent = field(child, "extent") === undefined ? undefined
      : await reference(child, "extent", spatialTypes.extent, resolveReference);
    if (sourceKind === "still" && extent === undefined) throw new Error(`${child.name}.extent is required for a still image.`);
    if (sourceKind !== "still" && extent !== undefined) throw new Error(`${child.name}.extent belongs only to a still image.`);
    const activation = await reference(child, "at", temporalTypes.instant, resolveReference);
    const cardAppearance = field(child, "appearance") === undefined
      ? appearance : await recipe(child, "appearance", resolveReference);
    const material = decodeDepthStackMaterial(cardAppearance, `${id}.${cardId}`, sourceKind);
    const fitId = `${id}.card.${suffix}.fit`;
    const sampleId = `${id}.card.${suffix}.sample-spec`;
    const cardSpecId = `${id}.card.${suffix}.card-spec`;
    records.push(
      { id: fitId, type: spatialTypes.fit, value: (material.fit), range },
      { id: sampleId, type: visualTrackTypes.sampleLayerSpec, value: (material.sample), range },
      { id: cardSpecId, type: depthStackTypes.cardSpec, value: (decodeDepthStackCardSpec(cardAppearance, cardId)), range },
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
    let labelRef: AuthorValueRef;
    if (field(child, "label") === undefined) {
      const labelId = `${id}.card.${suffix}.label-none`;
      records.push({ id: labelId, type: depthStackTypes.cardLabel, value: (noDepthStackCardLabel()), range });
      labelRef = { kind: "record", id: labelId };
    } else {
      labelRef = (await reference(child, "label", depthStackTypes.cardLabel, resolveReference)).ref;
    }
    inputs[labelName] = labelRef;
    let extentName: string | undefined;
    if (extent !== undefined) {
      extentName = `card-${suffix}-extent`;
      inputs[extentName] = extent.ref;
    }
    let pictureName: string | undefined;
    if (pictureField !== undefined) {
      pictureName = `card-${suffix}-picture`;
      const pictureId = `${id}.card.${suffix}.picture`;
      records.push({
        id: pictureId,
        type: mediaTypes.pictureInterpretation,
        value: pictureInterpretationProfile(text(child, "picture") as "srgb"),
        range,
      });
      inputs[pictureName] = { kind: "record", id: pictureId };
    }
    let framePaintSpecName: string | undefined;
    if (material.framePaint !== undefined) {
      framePaintSpecName = `card-${suffix}-frame-paint`;
      const paintId = `${id}.card.${suffix}.frame-paint`;
      records.push({ id: paintId, type: visualTrackTypes.paintLayerSpec, value: (material.framePaint), range });
      inputs[framePaintSpecName] = { kind: "record", id: paintId };
    }
    cards.push({
      suffix, sourceKind, sourceName,
      ...(extentName === undefined ? {} : { extentName }),
      ...(pictureName === undefined ? {} : { pictureName }),
      fitName, sampleSpecName,
      ...(framePaintSpecName === undefined ? {} : { framePaintSpecName }), labelName, cardSpecName, activationName,
    });
  }
  if (cards.length === 0) throw new Error(`${element.name} requires at least one Card.`);
  const fragment = createDepthStackFragment(cards, "terminal");
  return {
    records,
    components: [{ id, fragment, inputs, outputs: { program: `${id}.program`, visual: `${id}.visual` }, range: element.range }],
  };
}

const identifierField = (name = "id", required = true) => ({
  name,
  kind: "identifier" as const,
  required,
  summary: `Names this ${name}.`,
});

const literalField = (name: string, required = false, values?: readonly string[]) => ({
  name,
  kind: "literal" as const,
  required,
  summary: `Defines ${name}.`,
  ...(values === undefined ? {} : { values }),
});

const referenceField = (
  name: string,
  accepts: TypeRef | readonly TypeRef[],
  required: boolean,
  kind: "reference" | "expression" = "reference",
) => ({
  name,
  kind,
  required,
  accepts: Array.isArray(accepts) ? accepts as readonly TypeRef[] : [accepts as TypeRef],
  summary: `Selects ${name}.`,
});

function declarationId(declaration: AuthorDeclaration): string {
  return text(declaration, "id");
}

function outputBinding(
  component: string,
  output: string,
  name: string,
  type: TypeRef,
): AuthorDeclarationBinding {
  return { name, ref: { kind: "component-output", component, output }, type };
}

export const depthStackLabelAuthorDeclaration: AuthorDeclarationCompiler = {
  module: depthStackModuleRef,
  declaration: "label",
  outputs: [textTypes.text, depthStackTypes.cardLabelStyle, depthStackTypes.cardLabel],
  shape: {
    summary: "Binds label copy to one exact font stack and one label appearance.",
    fields: [
      identifierField(),
      referenceField("content", textTypes.text, false),
      referenceField("font", mediaTypes.fontStack, true),
      literalField("size"),
      literalField("color"),
      literalField("align", false, ["start", "center", "end", "justify"]),
      literalField("block", false, ["start", "center", "end"]),
      literalField("padding"),
    ],
    text: "Literal label copy when content is absent.",
  },
  bindings(declaration) {
    const id = declarationId(declaration);
    return [outputBinding(id, "label", id, depthStackTypes.cardLabel)];
  },
  compile: compileDepthStackLabel,
};

export const depthStackTrackAuthorDeclaration: AuthorDeclarationCompiler = {
  module: depthStackModuleRef,
  declaration: "track",
  outputs: [
    depthStackTypes.header,
    depthStackTypes.spec,
    depthStackTypes.cardSpec,
    spatialTypes.fit,
    visualTrackTypes.sampleLayerSpec,
    visualTrackTypes.paintLayerSpec,
    mediaTypes.pictureInterpretation,
    depthStackTypes.cardLabel,
    depthStackTypes.program,
    compositionTypes.visualTrack,
  ],
  shape: {
    summary: "Deals ordered Cards into one Frame and renders one peer VisualTrack.",
    fields: [
      identifierField(),
      referenceField("timeline", timelineTypes.timeline, true),
      referenceField("frame", spatialTypes.frame, true),
      referenceField("appearance", recipeType, true),
      referenceField("until", temporalTypes.instant, true, "expression"),
    ],
    children: [{
      name: "Card",
      cardinality: "many",
      summary: "Deals one visual source at one resolved Instant.",
      fields: [
        identifierField(),
        referenceField("source", [blobTypes.blob, mediaTypes.prepared, mediaTypes.compositableSurface], true),
        referenceField("extent", spatialTypes.extent, false),
        literalField("picture", false, ["srgb"]),
        referenceField("at", temporalTypes.instant, true, "expression"),
        referenceField("appearance", recipeType, false),
        referenceField("label", depthStackTypes.cardLabel, false),
      ],
    }],
  },
  bindings(declaration) {
    const id = declarationId(declaration);
    return [
      outputBinding(id, "program", `${id}.program`, depthStackTypes.program),
      outputBinding(id, "visual", `${id}.visual`, compositionTypes.visualTrack),
    ];
  },
  compile: compileDepthStack,
};

export const depthStackAuthorDeclarations = [
  depthStackLabelAuthorDeclaration,
  depthStackTrackAuthorDeclaration,
] as const;

export const depthStackMarkupDeclarations = [
  { name: "label", tag: "Label" },
  { name: "track", tag: "DepthStack" },
] as const;
