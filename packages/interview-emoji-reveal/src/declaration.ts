import { declarationField, type AuthorDeclaration, type AuthorDeclarationChild,
  type AuthorDeclarationCompiler, type AuthorResolvedReference, type AuthorValueRef } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { compositionTypes } from "@hypit/composition";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { temporalTypes } from "@hypit/temporal";
import { resolveAuthorInstant, resolveAuthorTimeline, resolveAuthorWindow, temporalContextFieldShape,
  temporalInstantFieldShape, temporalWindowFieldShape } from "@hypit/temporal/author";

import { createEmojiRevealFragment } from "./fragment.js";
import { emojiRevealModuleRef, emojiRevealTypes } from "./manifest.js";
import { sealEmojiRevealHeader, sealEmojiRevealItemSpec } from "./program.js";
import { decodeEmojiRevealStyle } from "./style.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Emoji Reveal ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

function optionalLiteral(declaration: DeclarationLike, name: string): string | undefined {
  return declarationField(declaration, name) === undefined ? undefined : literal(declaration, name);
}

async function reference(declaration: DeclarationLike, name: string, expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Emoji Reveal ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`Emoji Reveal ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

function authored<T>(value: AuthorResolvedReference, label: string): T {
  if (value.record === undefined) throw new Error(`${label} must reference authored data.`);
  return value.record.value as unknown as T;
}

export const emojiRevealStyleAuthorDeclaration: AuthorDeclarationCompiler = {
  module: emojiRevealModuleRef,
  declaration: "style",
  outputs: [emojiRevealTypes.style],
  shape: { summary: "Compiles one Recipe into the shared Emoji Reveal style.", fields: [
    { name: "id", kind: "identifier", required: true, summary: "Names the style." },
    { name: "recipe", kind: "reference", required: true, accepts: [recipeType], summary: "Selects the style Recipe." },
  ] },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: emojiRevealTypes.style }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const recipe = await reference(declaration, "recipe", recipeType, resolveReference);
    return { records: [{ id, type: emojiRevealTypes.style,
      value: decodeEmojiRevealStyle(id, authored<Recipe>(recipe, "Emoji Reveal recipe")) as unknown as CanonicalValue,
      range: declaration.range }], components: [] };
  },
};

export const emojiRevealTrackAuthorDeclaration: AuthorDeclarationCompiler = {
  module: emojiRevealModuleRef,
  declaration: "emojiReveal",
  outputs: [emojiRevealTypes.header, emojiRevealTypes.itemSpec, emojiRevealTypes.program,
    compositionTypes.visualTrack],
  shape: {
    summary: "Draws one adaptive row of preset or progressively revealed icon slots.",
    fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the reveal program." },
      temporalContextFieldShape,
      { name: "within", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Selects the placement Frame." },
      { name: "style", kind: "reference", required: true, accepts: [emojiRevealTypes.style], summary: "Selects the reveal style." },
      { name: "placeholder", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the unrevealed icon." },
      temporalWindowFieldShape,
    ],
    children: [{ name: "Item", cardinality: "many", summary: "Declares one answer slot.", fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the answer slot." },
      { name: "icon", kind: "reference", required: true, accepts: [blobTypes.blob], summary: "Selects the revealed icon." },
      { name: "preset", kind: "literal", required: false, values: ["true", "false"], summary: "Settles the item from the start." },
      { ...temporalInstantFieldShape, required: false },
    ] }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [
      { name: `${id}.program`, ref: { kind: "component-output", component: id, output: "program" },
        type: emojiRevealTypes.program },
      { name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" },
        type: compositionTypes.visualTrack },
    ];
  },
  async compile({ declaration, resolveReference }) {
    if (declaration.children.length === 0) throw new Error("EmojiReveal requires at least one Item.");
    const id = literal(declaration, "id");
    const timeline = await resolveAuthorTimeline(declaration, resolveReference);
    const outer = await resolveAuthorWindow(declaration, resolveReference);
    const within = await reference(declaration, "within", spatialTypes.frame, resolveReference);
    const style = await reference(declaration, "style", emojiRevealTypes.style, resolveReference);
    const placeholder = await reference(declaration, "placeholder", blobTypes.blob, resolveReference);
    const headerId = `${id}.header`;
    const records: { id: string; type: TypeRef; value: CanonicalValue; range: AuthorDeclaration["range"] }[] = [{
      id: headerId, type: emojiRevealTypes.header,
      value: sealEmojiRevealHeader({ id }) as unknown as CanonicalValue, range: declaration.range,
    }];
    const inputs: Record<string, AuthorValueRef> = { header: { kind: "record", id: headerId },
      timeline: timeline.ref, within: within.ref, style: style.ref, placeholder: placeholder.ref, outer: outer.ref };
    const items: { specName: string; iconName: string; activationName?: string }[] = [];
    const ids = new Set<string>();
    for (const child of declaration.children) {
      if (child.name !== "Item") throw new Error(`EmojiReveal does not accept ${child.name}.`);
      const itemId = literal(child, "id");
      if (ids.has(itemId)) throw new Error(`EmojiReveal contains duplicate Item id ${itemId}.`);
      ids.add(itemId);
      const presetValue = optionalLiteral(child, "preset") ?? "false";
      if (presetValue !== "true" && presetValue !== "false") throw new Error("EmojiReveal Item.preset must be true or false.");
      const preset = presetValue === "true";
      const timed = declarationField(child, "at") !== undefined;
      if (preset === timed) throw new Error(preset
        ? "EmojiReveal Item cannot combine preset=true with at."
        : "EmojiReveal Item requires at unless preset=true.");
      const icon = await reference(child, "icon", blobTypes.blob, resolveReference);
      const suffix = String(items.length + 1).padStart(4, "0");
      const specId = `${id}.item.${suffix}.spec`;
      const specName = `item-${suffix}-spec`;
      const iconName = `item-${suffix}-icon`;
      records.push({ id: specId, type: emojiRevealTypes.itemSpec,
        value: sealEmojiRevealItemSpec({ id: itemId, preset }) as unknown as CanonicalValue,
        range: child.range ?? declaration.range });
      inputs[specName] = { kind: "record", id: specId };
      inputs[iconName] = icon.ref;
      if (preset) items.push({ specName, iconName });
      else {
        const activationName = `item-${suffix}-activation`;
        inputs[activationName] = (await resolveAuthorInstant(child, resolveReference)).ref;
        items.push({ specName, iconName, activationName });
      }
    }
    return { records, components: [{ id, fragment: createEmojiRevealFragment(items), inputs,
      outputs: { program: `${id}.program`, visual: `${id}.visual` }, range: declaration.range }] };
  },
};

export const emojiRevealAuthorDeclarations = [emojiRevealStyleAuthorDeclaration,
  emojiRevealTrackAuthorDeclaration] as const;
export const emojiRevealMarkupDeclarations = [{ name: "style", tag: "Style" },
  { name: "emojiReveal", tag: "EmojiReveal" }] as const;
