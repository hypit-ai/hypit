import { declarationField, type AuthorDeclaration, type AuthorDeclarationChild,
  type AuthorDeclarationCompiler, type AuthorResolvedReference, type AuthorValueRef } from "@hypit/hypit/author";
import { blobTypes } from "@hypit/hypit/blob";
import { compositionTypes } from "@hypit/composition";
import { mediaTypes, type FontStackRef } from "@hypit/media";
import { recipeType, type Recipe } from "@hypit/hypit/recipe";
import { sameType, type CanonicalValue, type TypeRef } from "@hypit/hypit/protocol";
import { spatialTypes } from "@hypit/spatial";
import { sealText, textTypes } from "@hypit/hypit/text";
import { resolveAuthorTimeline, resolveAuthorWindow, temporalContextFieldShape,
  temporalWindowFieldShape } from "@hypit/temporal/author";

import { decodeCommentStickerStyle } from "./author.js";
import { createCommentStickerFragment } from "./fragment.js";
import { commentStickerModuleRef, commentStickerTypes } from "./manifest.js";
import { sealCommentStickerHeader, sealCommentStickerItemSpec } from "./program.js";

type DeclarationLike = AuthorDeclaration | AuthorDeclarationChild;

function literal(declaration: DeclarationLike, name: string): string {
  const field = declarationField(declaration, name);
  if (field?.kind !== "literal" || field.value.trim().length === 0) {
    throw new Error(`Comment Sticker ${declaration.name}.${name} must be a non-empty literal.`);
  }
  return field.value.trim();
}

async function reference(declaration: DeclarationLike, name: string, expected: TypeRef,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined) {
  const field = declarationField(declaration, name);
  if (field?.kind !== "reference") throw new Error(`Comment Sticker ${declaration.name}.${name} must be a reference.`);
  const value = await resolve(field.path);
  if (value === undefined || !sameType(value.type, expected)) throw new Error(`Comment Sticker ${declaration.name}.${name} has the wrong Type.`);
  return value;
}

function authored<T>(value: AuthorResolvedReference, label: string): T {
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

async function graphText(declaration: AuthorDeclarationChild, name: string,
  resolve: (path: string) => Promise<AuthorResolvedReference | undefined> | AuthorResolvedReference | undefined,
): Promise<string | AuthorResolvedReference | undefined> {
  const field = declarationField(declaration, name);
  if (field === undefined) return undefined;
  if (field.kind === "literal") {
    if (field.value.trim().length === 0) throw new Error(`Comment Sticker ${declaration.name}.${name} must not be empty.`);
    return field.value.trim();
  }
  return await reference(declaration, name, textTypes.text, resolve);
}

export const commentStickerStyleAuthorDeclaration: AuthorDeclarationCompiler = {
  module: commentStickerModuleRef,
  declaration: "style",
  outputs: [commentStickerTypes.style],
  shape: { summary: "Builds one comment Sticker style from a Recipe and Font Stack.", fields: [
    { name: "id", kind: "identifier", required: true, summary: "Names the style." },
    { name: "recipe", kind: "reference", required: true, accepts: [recipeType], summary: "Selects the style Recipe." },
    { name: "font", kind: "reference", required: true, accepts: [mediaTypes.fontStack], summary: "Selects the Font Stack." },
  ] },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [{ name: id, ref: { kind: "record", id }, type: commentStickerTypes.style }];
  },
  async compile({ declaration, resolveReference }) {
    const id = literal(declaration, "id");
    const recipe = await reference(declaration, "recipe", recipeType, resolveReference);
    const font = await reference(declaration, "font", mediaTypes.fontStack, resolveReference);
    return { records: [{ id, type: commentStickerTypes.style,
      value: decodeCommentStickerStyle(authored<Recipe>(recipe, "Comment Sticker recipe"),
        authored<FontStackRef>(font, "Comment Sticker font"), id) as unknown as CanonicalValue,
      range: declaration.range }], components: [] };
  },
};

export const commentStickerTrackAuthorDeclaration: AuthorDeclarationCompiler = {
  module: commentStickerModuleRef,
  declaration: "track",
  outputs: [textTypes.text, commentStickerTypes.header, commentStickerTypes.itemSpec,
    commentStickerTypes.program, compositionTypes.visualTrack],
  shape: {
    summary: "Builds a visual Track from timed comment Stickers.",
    fields: [{ name: "id", kind: "identifier", required: true, summary: "Names the Sticker program." },
      temporalContextFieldShape],
    children: [{ name: "Sticker", cardinality: "many", summary: "Declares one timed comment card.", fields: [
      { name: "id", kind: "identifier", required: true, summary: "Names the Sticker." },
      { name: "comment", kind: "expression", required: false, accepts: [textTypes.text], summary: "States or selects the comment text." },
      { name: "frame", kind: "reference", required: true, accepts: [spatialTypes.frame], summary: "Selects the placement Frame." },
      { name: "style", kind: "reference", required: true, accepts: [commentStickerTypes.style], summary: "Selects the Sticker style." },
      { name: "avatar", kind: "reference", required: false, accepts: [blobTypes.blob], summary: "Selects an optional avatar." },
      { name: "author", kind: "expression", required: false, accepts: [textTypes.text], summary: "States or selects the author label." },
      { name: "header", kind: "expression", required: false, accepts: [textTypes.text], summary: "States or selects the header label." },
      { name: "meta", kind: "expression", required: false, accepts: [textTypes.text], summary: "States or selects metadata text." },
      temporalWindowFieldShape,
    ], text: "Comment text when the comment field is omitted." }],
  },
  bindings(declaration) {
    const id = literal(declaration, "id");
    return [
      { name: `${id}.program`, ref: { kind: "component-output", component: id, output: "program" }, type: commentStickerTypes.program, exported: true },
      { name: `${id}.visual`, ref: { kind: "component-output", component: id, output: "visual" }, type: compositionTypes.visualTrack, exported: true },
    ];
  },
  async compile({ declaration, resolveReference }) {
    if (declaration.children.length === 0) throw new Error("Comment Sticker Track requires at least one Sticker.");
    const id = literal(declaration, "id");
    const timeline = await resolveAuthorTimeline(declaration, resolveReference);
    const headerId = `${id}.__header`;
    const records: { id: string; type: TypeRef; value: CanonicalValue; range: AuthorDeclaration["range"] }[] = [{
      id: headerId, type: commentStickerTypes.header,
      value: sealCommentStickerHeader({ id }) as unknown as CanonicalValue, range: declaration.range,
    }];
    const inputs: Record<string, AuthorValueRef> = { header: { kind: "record", id: headerId }, timeline: timeline.ref };
    const items: Parameters<typeof createCommentStickerFragment>[0][number][] = [];
    for (const child of declaration.children) {
      if (child.name !== "Sticker") throw new Error(`Comment Sticker Track does not accept ${child.name}.`);
      const suffix = String(items.length + 1).padStart(4, "0");
      const itemId = literal(child, "id");
      const window = await resolveAuthorWindow(child, resolveReference);
      const frame = await reference(child, "frame", spatialTypes.frame, resolveReference);
      const style = await reference(child, "style", commentStickerTypes.style, resolveReference);
      const avatar = declarationField(child, "avatar") === undefined ? undefined
        : await reference(child, "avatar", blobTypes.blob, resolveReference);
      const fieldComment = await graphText(child, "comment", resolveReference);
      const bodyComment = dedent(child.text ?? "");
      if (fieldComment !== undefined && bodyComment.length > 0) throw new Error("Comment Sticker cannot combine comment with body text.");
      const comment = fieldComment ?? bodyComment;
      if (typeof comment === "string" && comment.length === 0) throw new Error("Comment Sticker requires comment text.");
      const author = await graphText(child, "author", resolveReference);
      const displayHeader = await graphText(child, "header", resolveReference);
      const meta = await graphText(child, "meta", resolveReference);
      const specId = `${id}.item.${suffix}.spec`;
      records.push({ id: specId, type: commentStickerTypes.itemSpec,
        value: sealCommentStickerItemSpec({ id: itemId }) as unknown as CanonicalValue,
        range: child.range ?? declaration.range });
      const windowName = `item-${suffix}-window`;
      const specName = `item-${suffix}-spec`;
      const frameName = `item-${suffix}-frame`;
      const styleName = `item-${suffix}-style`;
      inputs[specName] = { kind: "record", id: specId };
      inputs[windowName] = window.ref;
      inputs[frameName] = frame.ref;
      inputs[styleName] = style.ref;
      const attachText = (field: string, value: string | AuthorResolvedReference): string => {
        const name = `item-${suffix}-${field}`;
        if (typeof value === "string") {
          const recordId = `${id}.item.${suffix}.${field}`;
          records.push({ id: recordId, type: textTypes.text, value: sealText(value), range: child.range ?? declaration.range });
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
      items.push({ windowName, specName, frameName, styleName, commentName,
        ...(authorName === undefined ? {} : { authorName }),
        ...(headerTextName === undefined ? {} : { headerTextName }),
        ...(metaName === undefined ? {} : { metaName }),
        ...(avatarName === undefined ? {} : { avatarName }) });
    }
    return { records, components: [{ id, fragment: createCommentStickerFragment(items), inputs,
      outputs: { program: `${id}.program`, visual: `${id}.visual` }, range: declaration.range }] };
  },
};

export const commentStickerAuthorDeclarations = [commentStickerStyleAuthorDeclaration,
  commentStickerTrackAuthorDeclaration] as const;
export const commentStickerMarkupDeclarations = [{ name: "style", tag: "Style" },
  { name: "track", tag: "Track" }] as const;
